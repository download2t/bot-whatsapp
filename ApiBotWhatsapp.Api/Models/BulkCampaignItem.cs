using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class BulkCampaignItem
{
    public int Id { get; set; }

    public int BulkCampaignId { get; set; }
    public BulkCampaign? BulkCampaign { get; set; }

    public int ContactId { get; set; }

    [Required]
    [MaxLength(200)]
    public string ContactName { get; set; } = string.Empty;

    [Required]
    [MaxLength(40)]
    public string PhoneNumber { get; set; } = string.Empty;

    // Pending | Sending | Sent | Failed | Cancelled
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Pending";

    [MaxLength(300)]
    public string? StatusDetail { get; set; }

    [MaxLength(150)]
    public string? MessageId { get; set; }

    public DateTime? ProcessedAtUtc { get; set; }
}
