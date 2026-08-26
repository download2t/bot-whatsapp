using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

// One row per user (OwnerUserId unique) — unlike CalendarPerson/CalendarReminder, this IS
// scoped per-user, because sending a WhatsApp message can only ever go out through that
// user's own connected session (user-{OwnerUserId}), never a shared one. The shared birthday
// data lives in CalendarPeople; this just says "who do I tell about it, and from my number".
public class CalendarBirthdayNotificationSetting
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    public bool IsEnabled { get; set; }

    [MaxLength(40)]
    public string? TargetPhoneNumber { get; set; }

    // Null means "use the built-in default text" (see CalendarBirthdayNotifierService).
    // Supports {nome} and {idade} placeholders.
    [MaxLength(1000)]
    public string? MessageTemplate { get; set; }

    public int NotifyHour { get; set; } = 8;
    public int NotifyMinute { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
}
