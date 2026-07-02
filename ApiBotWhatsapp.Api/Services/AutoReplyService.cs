using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;

namespace ApiBotWhatsapp.Api.Services;

public class AutoReplyService(AppDbContext dbContext, WhatsAppMessageSender messageSender, IConfiguration configuration)
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> PhoneLocks = new();
    private static readonly TimeSpan MaxIncomingMessageAge = TimeSpan.FromMinutes(5);
    private static readonly JsonSerializerOptions WindowsJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

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

            // 1. Define a direção e o status baseado no que veio do Node.js
            var direction = !string.IsNullOrWhiteSpace(request.Direction) ? request.Direction : "Incoming";
            var status = direction == "Outgoing" ? "Sent" : "Received";

            var incomingLog = new ApiBotWhatsapp.Api.Models.MessageLog
            {
                CompanyId = company.Id,
                WhatsAppNumber = normalizedWhatsApp,
                Direction = direction,
                PhoneNumber = normalizedPhone,
                ContactName = request.ContactName, // <--- NOME GRAVADO AQUI
                Content = request.Message,
                IsAutomatic = false,
                Status = status,
                TimestampUtc = brasiliaTime
            };

            dbContext.MessageLogs.Add(incomingLog);
            await dbContext.SaveChangesAsync(cancellationToken);

            // 2. TRAVA DE SEGURANÇA: Se a mensagem foi enviada por nós (Outgoing), 
            // paramos o processo aqui para o Bot não responder a si próprio.
            if (direction == "Outgoing")
            {
                return new WhatsAppWebhookResponse(false, "Outgoing message logged. Auto reply skipped.", null);
            }

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

            var currentTime = GetCurrentBrasiliaTime(configuration["WhatsApp:TimeZoneId"]);
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

            var outgoingLog = new ApiBotWhatsapp.Api.Models.MessageLog
            {
                CompanyId = company.Id,
                WhatsAppNumber = normalizedWhatsApp,
                Direction = "Outgoing",
                PhoneNumber = normalizedPhone,
                ContactName = request.ContactName, // <--- NOME MANTIDO TAMBÉM NA RESPOSTA AUTOMÁTICA
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

    private static bool IsRuleActive(DateTime currentTime, ScheduleRule rule)
    {
        var windows = GetRuleWindows(rule);
        var isWithinConfiguredWindow = IsWithinConfiguredWindow(currentTime, windows);

        if (rule.IsOutOfBusinessHours)
        {
            // Inverted logic: active OUTSIDE all configured windows for the current day
            return !isWithinConfiguredWindow;
        }

        // Normal logic: active WITHIN one of the configured windows for the current day
        return isWithinConfiguredWindow;
    }

    private static bool IsWithinRange(TimeSpan now, TimeSpan start, TimeSpan end)
    {
        if (start <= end)
        {
            return now >= start && now < end;
        }

        return now >= start || now < end;
    }

    private static bool IsWithinConfiguredWindow(DateTime currentTime, IEnumerable<ScheduleRuleTimeWindowRequest> windows)
    {
        var currentDay = (int)currentTime.DayOfWeek;
        var previousDay = currentDay == 0 ? 6 : currentDay - 1;
        var currentTimeOfDay = currentTime.TimeOfDay;

        foreach (var window in windows)
        {
            if (!TryParseTime(window.StartTime, out var startTime) || !TryParseTime(window.EndTime, out var endTime))
            {
                continue;
            }

            if (startTime <= endTime)
            {
                if (window.DayOfWeek == currentDay && IsWithinRange(currentTimeOfDay, startTime, endTime))
                {
                    return true;
                }

                continue;
            }

            if (window.DayOfWeek == currentDay && currentTimeOfDay >= startTime)
            {
                return true;
            }

            if (window.DayOfWeek == previousDay && currentTimeOfDay < endTime)
            {
                return true;
            }
        }

        return false;
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

    private static bool TryParseTime(string input, out TimeSpan value)
    {
        return TimeSpan.TryParseExact(input, @"hh\:mm", CultureInfo.InvariantCulture, out value);
    }

    private static List<ScheduleRuleTimeWindowRequest> GetLegacyWindows(ScheduleRule rule)
    {
        var start = rule.StartTime.ToString(@"hh\:mm");
        var end = rule.EndTime.ToString(@"hh\:mm");

        return Enumerable.Range(0, 7)
            .Select(day => new ScheduleRuleTimeWindowRequest(day, start, end))
            .ToList();
    }

    private static List<ScheduleRuleTimeWindowRequest> GetRuleWindows(ScheduleRule rule)
    {
        if (!string.IsNullOrWhiteSpace(rule.ScheduleWindowsJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<ScheduleRuleTimeWindowRequest>>(rule.ScheduleWindowsJson, WindowsJsonOptions);
                if (parsed is { Count: > 0 })
                {
                    return parsed
                        .Where(window => Enum.IsDefined(typeof(DayOfWeek), window.DayOfWeek))
                        .Where(window => TryParseTime(window.StartTime, out _) && TryParseTime(window.EndTime, out _))
                        .OrderBy(window => window.DayOfWeek)
                        .ThenBy(window => window.StartTime)
                        .ToList();
                }
            }
            catch
            {
                // Ignore malformed JSON and fall back to legacy fields.
            }
        }

        return GetLegacyWindows(rule);
    }

    private static DateTime GetCurrentBrasiliaTime(string? configuredTimeZoneId)
    {
        configuredTimeZoneId = string.IsNullOrWhiteSpace(configuredTimeZoneId)
            ? "E. South America Standard Time"
            : configuredTimeZoneId;

        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(configuredTimeZoneId);
            var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
            return localNow;
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