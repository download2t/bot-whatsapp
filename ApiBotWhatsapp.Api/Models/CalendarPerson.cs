using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

// Deliberately NOT scoped by OwnerUserId: this is a single shared address book, visible to
// every user with User.IsCalendarUser set — a separate module living inside the same
// platform/backend, unrelated to Contato/Turma (see CLAUDE.md "Isolamento por usuário").
public class CalendarPerson
{
    public int Id { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    // Age is intentionally not stored anywhere — it's always derived from this at read time
    // (CalendarDtos.CalculateAge), otherwise it would go stale the day after being saved.
    public DateOnly? BirthDate { get; set; }

    [MaxLength(40)]
    public string? PhoneNumber { get; set; }

    [MaxLength(150)]
    public string? Email { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
}
