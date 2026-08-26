using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class User
{
    public int Id { get; set; }

    public bool IsAdmin { get; set; }

    public bool IsActive { get; set; } = true;

    // Quando marcado, o usuário deixa de ver o sistema botzap inteiramente — o frontend abre
    // direto no módulo de calendário (pessoas + lembretes), que é uma lista compartilhada entre
    // todos os usuários com essa flag, sem relação com Contato/Turma/OwnerUserId.
    public bool IsCalendarUser { get; set; }

    [Required]
    [MaxLength(80)]
    public string Username { get; set; } = string.Empty;

    [Required]
    public string PasswordHash { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? Phone { get; set; }

    [MaxLength(14)]
    public string? Cpf { get; set; }

    [MaxLength(150)]
    public string? FullName { get; set; }

    [MaxLength(100)]
    public string? Title { get; set; }

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime? CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}
