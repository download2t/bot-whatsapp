using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class WhitelistNumber
{
    public int Id { get; set; }

    [MaxLength(120)]
    public string? Name { get; set; }

    [Required]
    [MaxLength(20)]
    public string PhoneNumber { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
