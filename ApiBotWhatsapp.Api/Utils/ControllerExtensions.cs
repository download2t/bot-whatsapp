using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace ApiBotWhatsapp.Api.Utils;

public static class ControllerExtensions
{
    /// <summary>
    /// Id of the authenticated user, from the NameIdentifier claim issued by JwtTokenService.
    /// Every piece of WhatsApp data (contacts, rules, messages, connection) is scoped to this id.
    /// </summary>
    public static int GetCurrentUserId(this ControllerBase controller)
    {
        var claim = controller.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(claim, out var userId) ? userId : 0;
    }
}
