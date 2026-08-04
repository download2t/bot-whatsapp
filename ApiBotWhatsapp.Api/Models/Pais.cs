using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class Pais
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    // Só dígitos, sem "+". Ex: "55" (Brasil), "258" (Moçambique), "244" (Angola),
    // "351" (Portugal), "238" (Cabo Verde).
    [Required]
    [MaxLength(5)]
    public string Ddi { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
