using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

// Also shared across all Calendário users, same as CalendarPerson. Birthdays are NOT
// materialized here as recurring reminders — the calendar screen derives them live from
// CalendarPerson.BirthDate for whatever month is being viewed. This table only holds
// explicit, user-authored reminders (optionally linked to a person).
public class CalendarReminder
{
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public DateOnly Date { get; set; }

    public TimeSpan? Time { get; set; }

    // e.g. a wedding anniversary or other yearly-recurring date that isn't a birthday.
    public bool IsRecurringYearly { get; set; }

    public int? CalendarPersonId { get; set; }
    public CalendarPerson? CalendarPerson { get; set; }

    // Audit only — who created it. Never used to filter/scope (the list is shared).
    public int CreatedByUserId { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
}
