namespace ApiBotWhatsapp.Api.Models;

// One row per (OwnerUserId, PhoneNumber) — tracks whether the operator still needs to look at
// this conversation after the bot acted on it automatically (text reply or chat-flow message).
// Set on every automatic outgoing send, cleared when the operator opens the conversation in
// /messages. Unrelated to WhatsApp's own read receipts or the bridge's "mark chat unread" call.
public class ConversationState
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    public string PhoneNumber { get; set; } = string.Empty;

    public bool PendingReview { get; set; }

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
