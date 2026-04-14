using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class Company
{
    public int Id { get; set; }

    [Required]
    [MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(80)]
    public string UniqueCode { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}