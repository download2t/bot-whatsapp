using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class UserCompany
{
    [Required]
    public int UserId { get; set; }

    [Required]
    public int CompanyId { get; set; }

    public DateTime AssignedAtUtc { get; set; } = DateTime.UtcNow;
}