using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class ScheduleRule
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public TimeSpan StartTime { get; set; }

    public TimeSpan EndTime { get; set; }

    [Required]
    public string ScheduleWindowsJson { get; set; } = "[]";

    // JSON list of { Text, Days[] } - which message to send depending on the current day of week.
    [Required]
    public string MessagesJson { get; set; } = "[]";

    public bool IsEnabled { get; set; } = true;

    // Throttle configuration: minutes to wait before sending another message to the same user
    public int ThrottleMinutes { get; set; } = 0;

    // Whether this rule applies only outside business hours (inverted logic)
    public bool IsOutOfBusinessHours { get; set; } = false;

    // Maximum daily messages per user for this rule
    public int? MaxDailyMessagesPerUser { get; set; } = null;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
