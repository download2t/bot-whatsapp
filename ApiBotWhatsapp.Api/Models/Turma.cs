using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class Turma
{
    public int Id { get; set; }

    public int CompanyId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
