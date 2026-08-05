using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

// Ephemeral per-contact state — a row only exists while a conversation is actively in
// progress. Deleted on completion (reaching an end step) or on timeout expiry. Durable
// history of what was said lives in MessageLogs regardless, with or without a flow.
public class ChatFlowConversation
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    [Required]
    [MaxLength(40)]
    public string PhoneNumber { get; set; } = string.Empty;

    public int ChatFlowId { get; set; }

    public int CurrentStepId { get; set; }
    public ChatFlowStep? CurrentStep { get; set; }

    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastMessageAtUtc { get; set; } = DateTime.UtcNow;
}
