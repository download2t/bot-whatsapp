using Microsoft.Extensions.Configuration;

namespace ApiBotWhatsapp.Api.Utils;

// Extracted out of AutoReplyService.GetCurrentBrasiliaTime so CalendarBirthdayNotifierService
// can share the exact same "what time is it right now, for this deployment" logic instead of
// duplicating the WhatsApp:TimeZoneId lookup + fallback.
public static class TimeZoneHelper
{
    public static DateTime GetCurrentLocalTime(IConfiguration configuration)
    {
        return ConvertUtcToLocal(DateTime.UtcNow, configuration);
    }

    // Extracted out of AutoReplyService.GetBrasiliaTimeFromUtc — converts an arbitrary UTC
    // instant (not just "now") to the configured local time. Used wherever a stored
    // MessageLog.TimestampUtc (always true UTC — see AutoReplyService/ChatFlowService) needs to
    // be shown/exported in Brasília time server-side (the CSV export in MessageLogsController).
    public static DateTime ConvertUtcToLocal(DateTime utcTime, IConfiguration configuration)
    {
        var configuredTimeZoneId = configuration["WhatsApp:TimeZoneId"];
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
