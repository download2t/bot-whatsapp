using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class ScheduleRuleWhatsAppNumber
{
    [Required]
    public int ScheduleRuleId { get; set; }

    [Required]
    [MaxLength(20)]
    public string WhatsAppNumber { get; set; } = string.Empty;
}