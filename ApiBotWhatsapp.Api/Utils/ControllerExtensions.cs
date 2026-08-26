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

    /// <summary>
    /// Whether the authenticated user has the Calendário flag, from the "is_calendar_user"
    /// claim issued by JwtTokenService. Gates the /api/calendar/* endpoints, which are a
    /// separate, shared-across-users module unrelated to the WhatsApp data above.
    /// </summary>
    public static bool IsCalendarUser(this ControllerBase controller)
    {
        return string.Equals(controller.User.FindFirst("is_calendar_user")?.Value, "true", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Whether the authenticated user is an admin, from the "is_admin" claim. Mirrors the
    /// check UsersController already did locally; centralized here so new controllers reuse it.
    /// </summary>
    public static bool IsCurrentUserAdmin(this ControllerBase controller)
    {
        return string.Equals(controller.User.FindFirst("is_admin")?.Value, "true", StringComparison.OrdinalIgnoreCase);
    }
}
