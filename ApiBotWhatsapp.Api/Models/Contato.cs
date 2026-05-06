using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class Contato
{
    public int Id { get; set; }

    public int CompanyId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(40)]
    public string PhoneNumber { get; set; } = string.Empty;

    public int? TurmaId { get; set; }
    public Turma? Turma { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
