using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

// One row per (OwnerUserId, CalendarPersonId, NotificationDate) — the unique index on that
// triple (see AppDbContext) is what makes CalendarBirthdayNotifierService's dedupe work: it
// checks for an existing row before sending, so a 5-minute tick loop (or a process restart
// mid-day) can never send the same person's birthday notice to the same user twice in one day.
public class CalendarBirthdayNotificationLog
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    // Nullable + SetNull on delete: this is a historical audit record, so it must survive
    // (and stay readable via PersonName) even after the person is later removed from
    // CalendarPeople — deleting a person must never be blocked by, or cascade into, old logs.
    public int? CalendarPersonId { get; set; }
    public CalendarPerson? CalendarPerson { get; set; }

    [MaxLength(200)]
    public string PersonName { get; set; } = string.Empty;

    public DateOnly NotificationDate { get; set; }

    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;

    public bool Success { get; set; }

    [MaxLength(500)]
    public string? StatusDetail { get; set; }
}
