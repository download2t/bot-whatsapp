using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace ApiBotWhatsapp.Api.Services;

public class AutoReplyService(AppDbContext dbContext, WhatsAppMessageSender messageSender, IConfiguration configuration)
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> PhoneLocks = new();

    public async Task<WhatsAppWebhookResponse> ProcessIncomingMessageAsync(WhatsAppWebhookRequest request, CancellationToken cancellationToken)
    {
        var normalizedPhone = NormalizePhone(request.PhoneNumber);
        var phoneLock = PhoneLocks.GetOrAdd(normalizedPhone, _ => new SemaphoreSlim(1, 1));
        await phoneLock.WaitAsync(cancellationToken);

        try
        {
            var brasiliaTime = GetCurrentBrasiliaTime(configuration["WhatsApp:TimeZoneId"]);

            var incomingLog = new MessageLog
            {
                Direction = "Incoming",
                PhoneNumber = normalizedPhone,
                Content = request.Message,
                IsAutomatic = false,
                Status = "Received",
                TimestampUtc = brasiliaTime
            };

            dbContext.MessageLogs.Add(incomingLog);
            await dbContext.SaveChangesAsync(cancellationToken);

            var isInWhitelist = await dbContext.WhitelistNumbers
                .AnyAsync(item => item.PhoneNumber == normalizedPhone, cancellationToken);

            if (isInWhitelist)
            {
                return new WhatsAppWebhookResponse(false, "Number is in whitelist. Auto reply skipped.", null);
            }

            var currentTime = GetCurrentRuleTime(configuration["WhatsApp:TimeZoneId"]);
            var matchedRule = await dbContext.ScheduleRules
                .Where(rule => rule.IsEnabled)
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
                var timeSinceLastMessage = await GetTimeSinceLastAutomaticMessageAsync(normalizedPhone, brasiliaTime, cancellationToken);
                if (timeSinceLastMessage.HasValue && timeSinceLastMessage.Value.TotalMinutes < rule.ThrottleMinutes)
                {
                    return new WhatsAppWebhookResponse(false,
                        $"Throttle active: {rule.ThrottleMinutes} minutes required between messages.", null);
                }
            }

            // Check daily limit
            if (rule.MaxDailyMessagesPerUser.HasValue && rule.MaxDailyMessagesPerUser > 0)
            {
                var todayMessageCount = await GetTodayAutomaticMessageCountAsync(normalizedPhone, rule.Id, brasiliaTime, cancellationToken);
                if (todayMessageCount >= rule.MaxDailyMessagesPerUser)
                {
                    return new WhatsAppWebhookResponse(false,
                        $"Daily limit reached: {rule.MaxDailyMessagesPerUser} messages per user.", null);
                }
            }

            var dispatchResult = await messageSender.SendMessageAsync(normalizedPhone, rule.Message, true, cancellationToken);

            var outgoingLog = new MessageLog
            {
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

    private async Task<TimeSpan?> GetTimeSinceLastAutomaticMessageAsync(string phoneNumber, DateTime nowReference, CancellationToken cancellationToken)
    {
        var lastMessage = await dbContext.MessageLogs
            .Where(m => m.PhoneNumber == phoneNumber 
                && m.IsAutomatic 
                && m.Direction == "Outgoing")
            .OrderByDescending(m => m.TimestampUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (lastMessage is null)
            return null;

        return nowReference - lastMessage.TimestampUtc;
    }

    private async Task<int> GetTodayAutomaticMessageCountAsync(string phoneNumber, int ruleId, DateTime brasiliaTime, CancellationToken cancellationToken)
    {
        var todayStart = brasiliaTime.Date;
        var todayEnd = todayStart.AddDays(1);

        return await dbContext.MessageLogs
            .CountAsync(m => m.PhoneNumber == phoneNumber 
                && m.IsAutomatic 
                && m.Direction == "Outgoing"
                && m.TimestampUtc >= todayStart
                && m.TimestampUtc < todayEnd,
                cancellationToken);
    }

    private static string NormalizePhone(string phone)
    {
        var digits = phone.Where(char.IsDigit).ToArray();
        return new string(digits);
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
}
