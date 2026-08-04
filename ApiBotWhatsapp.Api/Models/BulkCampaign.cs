using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class BulkCampaign
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    public int? TurmaId { get; set; }

    [Required]
    [MaxLength(100)]
    public string Greeting { get; set; } = string.Empty;

    [Required]
    [MaxLength(4000)]
    public string MessageTemplate { get; set; } = string.Empty;

    public int IntervalSeconds { get; set; } = 60;

    public bool MarkAsUnread { get; set; }

    [MaxLength(300)]
    public string? MediaUrl { get; set; }

    [MaxLength(150)]
    public string? MediaMimeType { get; set; }

    [MaxLength(255)]
    public string? MediaFileName { get; set; }

    // Running | Completed | Cancelled | Aborted | Interrupted
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Running";

    [MaxLength(300)]
    public string? AbortReason { get; set; }

    public int TotalCount { get; set; }
    public int SentCount { get; set; }
    public int FailedCount { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAtUtc { get; set; }

    public List<BulkCampaignItem> Items { get; set; } = new();
}
