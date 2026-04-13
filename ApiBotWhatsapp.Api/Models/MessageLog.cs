using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class MessageLog
{
    public int Id { get; set; }

    [Required]
    [MaxLength(20)]
    public string Direction { get; set; } = "Incoming";

    [Required]
    [MaxLength(20)]
    public string PhoneNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(4000)]
    public string Content { get; set; } = string.Empty;

    public bool IsAutomatic { get; set; }

    [MaxLength(120)]
    public string Status { get; set; } = "Received";

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
}
