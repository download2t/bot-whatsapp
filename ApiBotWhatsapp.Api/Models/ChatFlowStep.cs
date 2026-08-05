using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class ChatFlowStep
{
    public int Id { get; set; }

    public int ChatFlowId { get; set; }
    public ChatFlow? ChatFlow { get; set; }

    // Short label shown only in the editor (which step an option's "next step" dropdown
    // points to) — never sent to the contact.
    [MaxLength(100)]
    public string? Label { get; set; }

    [Required]
    [MaxLength(4000)]
    public string MessageText { get; set; } = string.Empty;

    // Exactly one step per ChatFlow should have this set — the entry point.
    public bool IsStartStep { get; set; }

    // Terminal step: reaching it ends the conversation (ChatFlowConversation row is deleted).
    public bool IsEndStep { get; set; }

    // Sent back when the contact's reply doesn't match any of this step's Options. Falls
    // back to a generic default message when null.
    [MaxLength(1000)]
    public string? InvalidAnswerMessage { get; set; }

    public List<ChatFlowOption> Options { get; set; } = new();
}
