using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class ChatFlow
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    // Inactivity after which an in-progress ChatFlowConversation is discarded and the
    // contact's next message starts the flow over from the beginning.
    public int TimeoutMinutes { get; set; } = 1440;

    // Sent to the contact when the timeout above fires, instead of silently forgetting the
    // conversation. Null falls back to a generic default message (see ChatFlowService).
    public string? TimeoutMessage { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<ChatFlowStep> Steps { get; set; } = new();
}
