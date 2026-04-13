using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class User
{
    public int Id { get; set; }

    [Required]
    [MaxLength(80)]
    public string Username { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(14)]
    public string? Cpf { get; set; }

    [MaxLength(150)]
    public string? FullName { get; set; }

    [MaxLength(100)]
    public string? Title { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime? CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}
