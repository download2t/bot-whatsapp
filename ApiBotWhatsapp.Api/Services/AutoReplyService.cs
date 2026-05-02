using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace ApiBotWhatsapp.Api.Services;

public class AutoReplyService(AppDbContext dbContext, WhatsAppMessageSender messageSender, IConfiguration configuration)
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> PhoneLocks = new();
    private static readonly TimeSpan MaxIncomingMessageAge = TimeSpan.FromMinutes(5);

    public async Task<WhatsAppWebhookResponse> ProcessIncomingMessageAsync(WhatsAppWebhookRequest request, CancellationToken cancellationToken)
    {
        var normalizedPhone = PhoneNumberUtils.Normalize(request.PhoneNumber);
        var normalizedWhatsApp = PhoneNumberUtils.Normalize(request.WhatsAppNumber ?? string.Empty);
        if (string.IsNullOrWhiteSpace(normalizedWhatsApp))
        {
            normalizedWhatsApp = PhoneNumberUtils.Normalize(configuration["WhatsApp:DefaultConnectedNumber"] ?? string.Empty);
        }

        if (string.IsNullOrWhiteSpace(normalizedWhatsApp))
        {
            return new WhatsAppWebhookResponse(false, "WhatsAppNumber is required for tenant routing.", null);
        }

        var companyCode = string.IsNullOrWhiteSpace(request.CompanyCode)
            ? SeedData.DefaultCompanyCode
            : request.CompanyCode.Trim();

        var company = await ResolveCompanyAsync(companyCode, normalizedWhatsApp, cancellationToken);
        if (company is null)
        {
            return new WhatsAppWebhookResponse(false, $"Company not found for code: {companyCode}", null);
        }

        var messageTimestampUtc = request.MessageTimestampUtc?.ToUniversalTime() ?? DateTime.UtcNow;
        var messageAge = DateTime.UtcNow - messageTimestampUtc;
        var isStale = messageAge > MaxIncomingMessageAge;

        var phoneLock = PhoneLocks.GetOrAdd(normalizedPhone, _ => new SemaphoreSlim(1, 1));
        await phoneLock.WaitAsync(cancellationToken);

        try
        {
            var brasiliaTime = GetBrasiliaTimeFromUtc(messageTimestampUtc, configuration["WhatsApp:TimeZoneId"]);

            var incomingLog = new MessageLog
            {
                CompanyId = company.Id,
                WhatsAppNumber = normalizedWhatsApp,
                Direction = "Incoming",
                PhoneNumber = normalizedPhone,
                Content = request.Message,
                IsAutomatic = false,
                Status = "Received",
                TimestampUtc = brasiliaTime
            };

            dbContext.MessageLogs.Add(incomingLog);
            await dbContext.SaveChangesAsync(cancellationToken);

            var equivalentPhoneNumbers = PhoneNumberUtils.GetEquivalentBrazilianNumbers(normalizedPhone);
            var isInWhitelist = await dbContext.WhitelistNumbers
                .AnyAsync(item => item.CompanyId == company.Id && equivalentPhoneNumbers.Contains(item.PhoneNumber), cancellationToken);

            if (isInWhitelist)
            {
                return new WhatsAppWebhookResponse(false, "Number is in whitelist. Auto reply skipped.", null);
            }

            if (isStale)
            {
                return new WhatsAppWebhookResponse(false, $"Incoming message is older than {MaxIncomingMessageAge.TotalMinutes:0} minutes. Auto reply skipped.", null);
            }

            var currentTime = GetCurrentRuleTime(configuration["WhatsApp:TimeZoneId"]);
            var matchedRule = await dbContext.ScheduleRules
                .Where(rule => rule.CompanyId == company.Id && rule.IsEnabled)
                .Where(rule =>
                    dbContext.ScheduleRuleWhatsAppNumbers.Any(item => item.ScheduleRuleId == rule.Id && item.WhatsAppNumber == normalizedWhatsApp)
                    || (rule.WhatsAppNumber == normalizedWhatsApp && !dbContext.ScheduleRuleWhatsAppNumbers.Any(item => item.ScheduleRuleId == rule.Id)))
                .OrderBy(rule => rule.StartTime)
                .ToListAsync(cancellationToken);

            var rule = matchedRule.FirstOrDefault(item => IsRuleActive(currentTime, item));
            if (rule is null)
            {
                return new WhatsAppWebhookResponse(false, "No active schedule rule for current time.", null);
            }

            // Check throttle: don't send if already sent within ThrottleMinutes
            if (rule.ThrottleMinutes > 0)
            {
                var timeSinceLastMessage = await GetTimeSinceLastAutomaticMessageAsync(company.Id, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
                
                if (timeSinceLastMessage.HasValue && timeSinceLastMessage.Value.TotalMinutes < rule.ThrottleMinutes)
                {
                    return new WhatsAppWebhookResponse(false,
                        $"Throttle active: {rule.ThrottleMinutes} minutes required between messages.", null);
                }
            }

            // Check daily limit
            if (rule.MaxDailyMessagesPerUser.HasValue && rule.MaxDailyMessagesPerUser > 0)
            {
                var todayMessageCount = await GetTodayAutomaticMessageCountAsync(company.Id, normalizedPhone, normalizedWhatsApp, rule.Id, brasiliaTime, cancellationToken);
                if (todayMessageCount >= rule.MaxDailyMessagesPerUser)
                {
                    return new WhatsAppWebhookResponse(false,
                        $"Daily limit reached: {rule.MaxDailyMessagesPerUser} messages per user.", null);
                }
            }

            var dispatchResult = await messageSender.SendMessageAsync(normalizedPhone, rule.Message, true, normalizedWhatsApp, cancellationToken);

            var outgoingLog = new MessageLog
            {
                CompanyId = company.Id,
                WhatsAppNumber = normalizedWhatsApp,
                Direction = "Outgoing",
                PhoneNumber = normalizedPhone,
                Content = rule.Message,
                IsAutomatic = true,
                Status = dispatchResult.Status,
                TimestampUtc = brasiliaTime
            };

            dbContext.MessageLogs.Add(outgoingLog);
            await dbContext.SaveChangesAsync(cancellationToken);

            return new WhatsAppWebhookResponse(dispatchResult.Success, dispatchResult.Status, rule.Message);
        }
        finally
        {
            phoneLock.Release();
        }
    }

    private static bool IsRuleActive(TimeSpan currentTime, ScheduleRule rule)
    {
        if (rule.IsOutOfBusinessHours)
        {
            // Inverted logic: active OUTSIDE the time range
            return !IsWithinRange(currentTime, rule.StartTime, rule.EndTime);
        }
        else
        {
            // Normal logic: active WITHIN the time range
            return IsWithinRange(currentTime, rule.StartTime, rule.EndTime);
        }
    }

    private static bool IsWithinRange(TimeSpan now, TimeSpan start, TimeSpan end)
    {
        if (start <= end)
        {
            return now >= start && now < end;
        }

        return now >= start || now < end;
    }

    private async Task<TimeSpan?> GetTimeSinceLastAutomaticMessageAsync(int companyId, string phoneNumber, string whatsAppNumber, DateTime nowReference, CancellationToken cancellationToken)
    {
        var lastMessage = await dbContext.MessageLogs
            .Where(m => m.CompanyId == companyId
                && m.WhatsAppNumber == whatsAppNumber
                && m.PhoneNumber == phoneNumber 
                && m.IsAutomatic 
                && m.Direction == "Outgoing")
            .OrderByDescending(m => m.TimestampUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (lastMessage is null)
            return null;

        return nowReference - lastMessage.TimestampUtc;
    }

    private async Task<int> GetTodayAutomaticMessageCountAsync(int companyId, string phoneNumber, string whatsAppNumber, int ruleId, DateTime brasiliaTime, CancellationToken cancellationToken)
    {
        var todayStart = brasiliaTime.Date;
        var todayEnd = todayStart.AddDays(1);

        return await dbContext.MessageLogs
            .CountAsync(m => m.CompanyId == companyId
                && m.WhatsAppNumber == whatsAppNumber
                && m.PhoneNumber == phoneNumber 
                && m.IsAutomatic 
                && m.Direction == "Outgoing"
                && m.TimestampUtc >= todayStart
                && m.TimestampUtc < todayEnd,
                cancellationToken);
    }

    private static TimeSpan GetCurrentRuleTime(string? configuredTimeZoneId)
    {
        configuredTimeZoneId = string.IsNullOrWhiteSpace(configuredTimeZoneId)
            ? "E. South America Standard Time"
            : configuredTimeZoneId;

        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(configuredTimeZoneId);
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
            return localNow.TimeOfDay;
        }
        catch (TimeZoneNotFoundException)
        {
            return DateTime.Now.TimeOfDay;
        }
        catch (InvalidTimeZoneException)
        {
            return DateTime.Now.TimeOfDay;
        }
    }

    private static DateTime GetCurrentBrasiliaTime(string? configuredTimeZoneId)
    {
        configuredTimeZoneId = string.IsNullOrWhiteSpace(configuredTimeZoneId)
            ? "E. South America Standard Time"
            : configuredTimeZoneId;

        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(configuredTimeZoneId);
            var brasiliaTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
            return brasiliaTime;
        }
        catch (TimeZoneNotFoundException)
        {
            return DateTime.Now;
        }
        catch (InvalidTimeZoneException)
        {
            return DateTime.Now;
        }
    }

    private static DateTime GetBrasiliaTimeFromUtc(DateTime utcTime, string? configuredTimeZoneId)
    {
        configuredTimeZoneId = string.IsNullOrWhiteSpace(configuredTimeZoneId)
            ? "E. South America Standard Time"
            : configuredTimeZoneId;

        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(configuredTimeZoneId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcTime, DateTimeKind.Utc), timezone);
        }
        catch (TimeZoneNotFoundException)
        {
            return DateTime.SpecifyKind(utcTime, DateTimeKind.Utc).ToLocalTime();
        }
        catch (InvalidTimeZoneException)
        {
            return DateTime.SpecifyKind(utcTime, DateTimeKind.Utc).ToLocalTime();
        }
    }

    private async Task<Company?> ResolveCompanyAsync(string companyCode, string normalizedWhatsApp, CancellationToken cancellationToken)
    {
        var company = await dbContext.Companies.FirstOrDefaultAsync(c => c.UniqueCode == companyCode, cancellationToken);
        if (company is not null)
        {
            return company;
        }

        if (!string.IsNullOrWhiteSpace(normalizedWhatsApp))
        {
            var companyIdsByRules = await dbContext.ScheduleRules
                .Where(rule =>
                    dbContext.ScheduleRuleWhatsAppNumbers.Any(item => item.ScheduleRuleId == rule.Id && item.WhatsAppNumber == normalizedWhatsApp)
                    || (rule.WhatsAppNumber == normalizedWhatsApp && !dbContext.ScheduleRuleWhatsAppNumbers.Any(item => item.ScheduleRuleId == rule.Id)))
                .Select(rule => rule.CompanyId)
                .Distinct()
                .Take(2)
                .ToListAsync(cancellationToken);

            if (companyIdsByRules.Count == 1)
            {
                return await dbContext.Companies.FirstOrDefaultAsync(c => c.Id == companyIdsByRules[0], cancellationToken);
            }

            var companyIdsByLogs = await dbContext.MessageLogs
                .Where(item => item.WhatsAppNumber == normalizedWhatsApp)
                .Select(item => item.CompanyId)
                .Distinct()
                .Take(2)
                .ToListAsync(cancellationToken);

            if (companyIdsByLogs.Count == 1)
            {
                return await dbContext.Companies.FirstOrDefaultAsync(c => c.Id == companyIdsByLogs[0], cancellationToken);
            }
        }

        var allCompanyIds = await dbContext.Companies
            .Select(item => item.Id)
            .Take(2)
            .ToListAsync(cancellationToken);

        if (allCompanyIds.Count == 1)
        {
            return await dbContext.Companies.FirstOrDefaultAsync(c => c.Id == allCompanyIds[0], cancellationToken);
        }

        return null;
    }
}
