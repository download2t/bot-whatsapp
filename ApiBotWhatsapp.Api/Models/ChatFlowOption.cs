using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class ChatFlowOption
{
    public int Id { get; set; }

    public int ChatFlowStepId { get; set; }
    public ChatFlowStep? ChatFlowStep { get; set; }

    [Required]
    [MaxLength(150)]
    public string Label { get; set; } = string.Empty;

    // JSON string array of accepted keywords/phrases for this option (trimmed,
    // case-insensitive exact match — no fuzzy matching).
    [Required]
    public string MatchKeywordsJson { get; set; } = "[]";

    public int NextStepId { get; set; }
    public ChatFlowStep? NextStep { get; set; }
}
