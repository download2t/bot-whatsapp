using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;

namespace ApiBotWhatsapp.Api.Services;

public class AutoReplyService(
    AppDbContext dbContext,
    WhatsAppMessageSender messageSender,
    WhatsAppBridgeClient bridgeClient,
    MediaStorageService mediaStorage,
    ChatFlowService chatFlowService,
    ConversationInboxService conversationInbox,
    IConfiguration configuration,
    ILogger<AutoReplyService> logger)
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> PhoneLocks = new();
    private static readonly TimeSpan MaxIncomingMessageAge = TimeSpan.FromMinutes(5);
    private static readonly JsonSerializerOptions WindowsJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<WhatsAppWebhookResponse> ProcessIncomingMessageAsync(WhatsAppWebhookRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = request.OwnerUserId!.Value;
        var normalizedPhone = PhoneNumberUtils.Normalize(request.PhoneNumber);
        var normalizedWhatsApp = PhoneNumberUtils.Normalize(request.WhatsAppNumber ?? string.Empty);
        if (string.IsNullOrWhiteSpace(normalizedWhatsApp))
        {
            normalizedWhatsApp = PhoneNumberUtils.Normalize(configuration["WhatsApp:DefaultConnectedNumber"] ?? string.Empty);
        }

        var messageTimestampUtc = request.MessageTimestampUtc?.ToUniversalTime() ?? DateTime.UtcNow;
        var messageAge = DateTime.UtcNow - messageTimestampUtc;
        var isStale = messageAge > MaxIncomingMessageAge;

        // Locks are scoped per owner+phone so two different users' contacts never contend.
        var lockKey = $"{ownerUserId}:{normalizedPhone}";
        var phoneLock = PhoneLocks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));
        await phoneLock.WaitAsync(cancellationToken);

        try
        {
            // Idempotency guard: whatsapp-web.js can re-emit message_create for the same
            // message (e.g. after a session reconnect/resync). Without this, a replayed
            // message could be logged and auto-replied to a second time.
            if (!string.IsNullOrWhiteSpace(request.MessageId))
            {
                var alreadyProcessed = await dbContext.MessageLogs
                    .AnyAsync(item => item.MessageId == request.MessageId, cancellationToken);
                if (alreadyProcessed)
                {
                    return new WhatsAppWebhookResponse(false, "Duplicate message ignored (already processed).", null);
                }
            }

            var brasiliaTime = GetBrasiliaTimeFromUtc(messageTimestampUtc, configuration["WhatsApp:TimeZoneId"]);

            // 1. Define a direção e o status baseado no que veio do Node.js
            var direction = !string.IsNullOrWhiteSpace(request.Direction) ? request.Direction : "Incoming";
            var status = direction == "Outgoing" ? "Sent" : "Received";

            string? incomingMediaUrl = null;
            if (!string.IsNullOrWhiteSpace(request.MediaBase64))
            {
                try
                {
                    incomingMediaUrl = mediaStorage.SaveBase64(ownerUserId, request.MediaBase64, request.MediaMimeType, request.MediaFileName);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to save incoming media for OwnerUserId={OwnerUserId} Phone={Phone}.", ownerUserId, normalizedPhone);
                }
            }

            var incomingLog = new ApiBotWhatsapp.Api.Models.MessageLog
            {
                OwnerUserId = ownerUserId,
                WhatsAppNumber = normalizedWhatsApp,
                Direction = direction,
                PhoneNumber = normalizedPhone,
                ContactName = request.ContactName,
                Content = request.Message,
                MediaUrl = incomingMediaUrl,
                MediaMimeType = incomingMediaUrl is not null ? request.MediaMimeType : null,
                MediaFileName = incomingMediaUrl is not null ? request.MediaFileName : null,
                IsAutomatic = false,
                Status = status,
                TimestampUtc = brasiliaTime,
                MessageId = request.MessageId
            };

            dbContext.MessageLogs.Add(incomingLog);
            await dbContext.SaveChangesAsync(cancellationToken);

            // 2. TRAVA DE SEGURANÇA: Se a mensagem foi enviada por nós (Outgoing),
            // paramos o processo aqui para o Bot não responder a si próprio.
            if (direction == "Outgoing")
            {
                return new WhatsAppWebhookResponse(false, "Outgoing message logged. Auto reply skipped.", null);
            }

            // Moved up from further below so it gates both paths that follow (chat flow and
            // ScheduleRule) uniformly, instead of only the schedule-rule one — and so a stale
            // message doesn't pay for a contact/LID lookup it's going to discard anyway.
            if (isStale)
            {
                return new WhatsAppWebhookResponse(false, $"Incoming message is older than {MaxIncomingMessageAge.TotalMinutes:0} minutes. Auto reply skipped.", null);
            }

            // Resolve se quem mandou a mensagem é um Contato conhecido do MESMO dono (qualquer
            // turma) — não é mais um gate automático aqui; cada ScheduleRule decide, via
            // AudienceMode, se aceita só contato cadastrado, qualquer um, ou qualquer um exceto
            // cadastrado/exceto uma turma (ver IsAudienceEligible mais abaixo). matchedContact
            // pode ficar null sem impedir resposta, dependendo da regra.
            // Compara pelos últimos dígitos (número local) em vez de string exata: absorve
            // diferenças de DDI (contato cadastrado sem "55", WhatsApp sempre manda com) e o
            // "9" extra do celular brasileiro, de forma genérica para qualquer país.
            var phoneCore = PhoneNumberUtils.CoreDigits(normalizedPhone);
            var matchedContact = await dbContext.Contatos
                .Where(item => item.OwnerUserId == ownerUserId && item.IsActive)
                .FirstOrDefaultAsync(item => EF.Functions.Like(item.PhoneNumber, "%" + phoneCore), cancellationToken);

            // WhatsApp's LID (Linked ID) privacy layer can report the sender as an opaque
            // "{digits}@lid" id instead of a real phone number when there's no prior message
            // history with the connected number — in that case PhoneNumber is meaningless and
            // will never suffix-match a registered contact. Instead of trying to decode the LID
            // (unreliable/undocumented), we do the reverse: ask the bridge which WID it currently
            // uses for each of our registered contacts, and see if any of them equals this LID.
            if (matchedContact is null
                && !string.IsNullOrWhiteSpace(request.RawSenderId)
                && request.RawSenderId.EndsWith("@lid", StringComparison.OrdinalIgnoreCase))
            {
                logger.LogInformation(
                    "Contact gate: no direct match for Phone={Phone} (core={Core}). RawSenderId={RawSenderId} looks like a LID, trying reverse WID lookup against registered contacts for OwnerUserId={OwnerUserId}.",
                    normalizedPhone, phoneCore, request.RawSenderId, ownerUserId);

                var candidateContacts = await dbContext.Contatos
                    .Where(item => item.OwnerUserId == ownerUserId && item.IsActive)
                    .ToListAsync(cancellationToken);

                if (candidateContacts.Count > 0)
                {
                    var resolved = await bridgeClient.ResolveWidsAsync(
                        $"user-{ownerUserId}",
                        candidateContacts.Select(item => item.PhoneNumber).ToList(),
                        cancellationToken);

                    var match = resolved.FirstOrDefault(item =>
                        string.Equals(item.Wid, request.RawSenderId, StringComparison.OrdinalIgnoreCase));

                    if (match is not null)
                    {
                        matchedContact = candidateContacts.FirstOrDefault(item => item.PhoneNumber == match.PhoneNumber);
                    }

                    if (matchedContact is not null)
                    {
                        logger.LogInformation(
                            "Contact gate: reverse WID lookup matched RawSenderId={RawSenderId} to registered contact phone={ContactPhone}. Using that as the real sender from now on.",
                            request.RawSenderId, matchedContact.PhoneNumber);

                        // Now that we know who this really is, replace the meaningless LID
                        // digit-string with the contact's real phone for logging, throttling,
                        // and for sending the reply.
                        normalizedPhone = PhoneNumberUtils.Normalize(matchedContact.PhoneNumber);
                        incomingLog.PhoneNumber = normalizedPhone;
                        await dbContext.SaveChangesAsync(cancellationToken);
                    }
                    else
                    {
                        logger.LogInformation(
                            "Contact gate: reverse WID lookup found no match for RawSenderId={RawSenderId} among {Count} registered contacts.",
                            request.RawSenderId, candidateContacts.Count);
                    }
                }
            }

            // If this contact already has a chat-flow conversation in progress, their reply
            // continues it regardless of what today's ScheduleRule message would otherwise be —
            // an in-progress conversation always wins over re-evaluating rules. Returns null
            // when there's no conversation, and the normal rule/message selection below runs
            // exactly as it did before chat flows existed.
            var continuedFlowResponse = await chatFlowService.TryContinueAsync(
                ownerUserId, normalizedPhone, request.Message ?? string.Empty, normalizedWhatsApp, brasiliaTime, cancellationToken);
            if (continuedFlowResponse is not null)
            {
                return continuedFlowResponse;
            }

            var currentTime = GetCurrentBrasiliaTime(configuration["WhatsApp:TimeZoneId"]);
            var matchedRule = await dbContext.ScheduleRules
                .Where(rule => rule.OwnerUserId == ownerUserId && rule.IsEnabled)
                .OrderBy(rule => rule.StartTime)
                .ToListAsync(cancellationToken);

            var rule = matchedRule.FirstOrDefault(item => IsRuleActive(currentTime, item) && IsAudienceEligible(item, matchedContact));
            if (rule is null)
            {
                return new WhatsAppWebhookResponse(false, "No active schedule rule for current time.", null);
            }

            // Resolve which registered país the sender belongs to, by DDI prefix of the real
            // WhatsApp-sourced number (normalizedPhone always carries the real country code —
            // unlike Contato.PhoneNumber, which may have been typed without one). Longest DDI
            // first avoids a shorter registered code false-matching when a longer one also fits.
            var ownerPaises = await dbContext.Paises
                .Where(p => p.OwnerUserId == ownerUserId && p.IsActive)
                .OrderByDescending(p => p.Ddi.Length)
                .ToListAsync(cancellationToken);
            var matchedPais = ownerPaises.FirstOrDefault(p => normalizedPhone.StartsWith(p.Ddi));

            var currentDayOfWeek = (int)currentTime.DayOfWeek;
            var todaysMessages = GetRuleMessages(rule).Where(item => item.Days.Contains(currentDayOfWeek));
            var messageForToday = todaysMessages.FirstOrDefault(item => item.PaisId == matchedPais?.Id)
                ?? todaysMessages.FirstOrDefault(item => item.PaisId is null);
            if (messageForToday is null)
            {
                return new WhatsAppWebhookResponse(false, "No message configured for the current day of week. Auto reply skipped.", null);
            }

            // Check throttle: don't send if already sent within ThrottleMinutes. Counts ANY
            // outgoing message, not just automatic ones — a manual reply from the operator
            // (e.g. via /messages) resets the same clock, so the bot doesn't jump back in right
            // after a human already took over the conversation.
            if (rule.ThrottleMinutes > 0)
            {
                var timeSinceLastMessage = await GetTimeSinceLastOutgoingMessageAsync(ownerUserId, normalizedPhone, brasiliaTime, cancellationToken);

                if (timeSinceLastMessage.HasValue && timeSinceLastMessage.Value.TotalMinutes < rule.ThrottleMinutes)
                {
                    return new WhatsAppWebhookResponse(false,
                        $"Throttle active: {rule.ThrottleMinutes} minutes required between messages.", null);
                }
            }

            // Check daily limit
            if (rule.MaxDailyMessagesPerUser.HasValue && rule.MaxDailyMessagesPerUser > 0)
            {
                var todayMessageCount = await GetTodayAutomaticMessageCountAsync(ownerUserId, normalizedPhone, brasiliaTime, cancellationToken);
                if (todayMessageCount >= rule.MaxDailyMessagesPerUser)
                {
                    return new WhatsAppWebhookResponse(false,
                        $"Daily limit reached: {rule.MaxDailyMessagesPerUser} messages per user.", null);
                }
            }

            // This message is configured to kick off a chat flow instead of sending fixed
            // text — hand off to ChatFlowService, which creates the conversation and sends the
            // flow's own start-step message (already logs it to MessageLogs itself).
            if (messageForToday.ChatFlowId is not null)
            {
                return await chatFlowService.StartConversationAsync(
                    messageForToday.ChatFlowId.Value, ownerUserId, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
            }

            var dispatchResult = await messageSender.SendMessageAsync(normalizedPhone, messageForToday.Text, true, $"user-{ownerUserId}", cancellationToken);
            logger.LogInformation(
                "AutoReply: sent rule text to OwnerUserId={OwnerUserId} Phone={Phone} — Success={Success} UnreadApplied={UnreadApplied}.",
                ownerUserId, normalizedPhone, dispatchResult.Success, dispatchResult.UnreadApplied);

            var outgoingLog = new ApiBotWhatsapp.Api.Models.MessageLog
            {
                OwnerUserId = ownerUserId,
                WhatsAppNumber = normalizedWhatsApp,
                Direction = "Outgoing",
                PhoneNumber = normalizedPhone,
                ContactName = request.ContactName,
                Content = messageForToday.Text,
                IsAutomatic = true,
                Status = dispatchResult.Status,
                MessageId = dispatchResult.MessageId,
                TimestampUtc = brasiliaTime
            };

            dbContext.MessageLogs.Add(outgoingLog);
            await dbContext.SaveChangesAsync(cancellationToken);
            await conversationInbox.MarkPendingReviewAsync(ownerUserId, normalizedPhone, cancellationToken);

            return new WhatsAppWebhookResponse(dispatchResult.Success, dispatchResult.Status, messageForToday.Text);
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

    // Per-rule audience gate — replaces what used to be a single global "must be a registered
    // Contato" check before any rule was even considered. Each rule now picks its own audience.
    private static bool IsAudienceEligible(ScheduleRule rule, Contato? matchedContact) => rule.AudienceMode switch
    {
        "Anyone" => true,
        "AnyoneExceptRegistered" => matchedContact is null,
        "AnyoneExceptTurma" => matchedContact is null || matchedContact.TurmaId != rule.ExcludedTurmaId,
        _ => matchedContact is not null, // "RegisteredContacts" (default/legacy fallback)
    };

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

    private async Task<TimeSpan?> GetTimeSinceLastOutgoingMessageAsync(int ownerUserId, string phoneNumber, DateTime nowReference, CancellationToken cancellationToken)
    {
        var lastMessage = await dbContext.MessageLogs
            .Where(m => m.OwnerUserId == ownerUserId
                && m.PhoneNumber == phoneNumber
                && m.Direction == "Outgoing")
            .OrderByDescending(m => m.TimestampUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (lastMessage is null)
            return null;

        return nowReference - lastMessage.TimestampUtc;
    }

    private async Task<int> GetTodayAutomaticMessageCountAsync(int ownerUserId, string phoneNumber, DateTime brasiliaTime, CancellationToken cancellationToken)
    {
        var todayStart = brasiliaTime.Date;
        var todayEnd = todayStart.AddDays(1);

        return await dbContext.MessageLogs
            .CountAsync(m => m.OwnerUserId == ownerUserId
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

    private static List<ScheduleRuleMessageRequest> GetRuleMessages(ScheduleRule rule)
    {
        if (string.IsNullOrWhiteSpace(rule.MessagesJson))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<ScheduleRuleMessageRequest>>(rule.MessagesJson, WindowsJsonOptions) ?? [];
        }
        catch
        {
            return [];
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
}
