using Microsoft.Extensions.Configuration;

namespace ApiBotWhatsapp.Api.Utils;

// Extracted out of AutoReplyService.GetCurrentBrasiliaTime so CalendarBirthdayNotifierService
// can share the exact same "what time is it right now, for this deployment" logic instead of
// duplicating the WhatsApp:TimeZoneId lookup + fallback.
public static class TimeZoneHelper
{
    public static DateTime GetCurrentLocalTime(IConfiguration configuration)
    {
        var configuredTimeZoneId = configuration["WhatsApp:TimeZoneId"];
        configuredTimeZoneId = string.IsNullOrWhiteSpace(configuredTimeZoneId)
            ? "E. South America Standard Time"
            : configuredTimeZoneId;

        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(configuredTimeZoneId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
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
