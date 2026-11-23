using System.Text.RegularExpressions;
using ApiBotWhatsapp.Api.Services;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;

namespace ApiBotWhatsapp.Api.Controllers;

// Operational health of the server and of the WhatsApp bridge ("Saúde do Sistema" panel).
// Admin-only: the repair actions kill processes and restart services for EVERYONE on the server.
// It shows infrastructure status (CPU, memory, per-session Chrome usage) - never phone numbers,
// contacts or messages, so it does not break the per-user WhatsApp data isolation.
//
// Every action is a fixed operation implemented by the bridge; nothing here accepts a command or a
// path from the client. The only client-supplied value is a session id, validated strictly.
[ApiController]
[Route("api/system-health")]
public partial class SystemHealthController(
    WhatsAppBridgeClient bridgeClient,
    ILogger<SystemHealthController> logger) : ControllerBase
{
    [GeneratedRegex("^[A-Za-z0-9_-]{1,40}$")]
    private static partial Regex SessionIdPattern();

    [HttpGet]
    public Task<IActionResult> GetHealth(CancellationToken cancellationToken) =>
        ForwardAsync(HttpMethod.Get, "/admin/health", "consultou a saúde do sistema", audit: false, cancellationToken);

    [HttpPost("actions/cleanup-chrome")]
    public Task<IActionResult> CleanupChrome(CancellationToken cancellationToken) =>
        ForwardAsync(HttpMethod.Post, "/admin/cleanup-chrome", "limpou processos Chrome órfãos", audit: true, cancellationToken);

    [HttpPost("actions/restart-bridge")]
    public Task<IActionResult> RestartBridge(CancellationToken cancellationToken) =>
        ForwardAsync(HttpMethod.Post, "/admin/restart-bridge", "reiniciou o bridge do WhatsApp", audit: true, cancellationToken);

    [HttpPost("sessions/{sessionId}/restart")]
    public Task<IActionResult> RestartSession(string sessionId, CancellationToken cancellationToken)
    {
        if (!SessionIdPattern().IsMatch(sessionId))
        {
            return Task.FromResult<IActionResult>(BadRequest("Invalid session id."));
        }

        return ForwardAsync(
            HttpMethod.Post,
            $"/session/{Uri.EscapeDataString(sessionId)}/restart",
            $"reiniciou a sessão {sessionId}",
            audit: true,
            cancellationToken);
    }

    [HttpPost("sessions/{sessionId}/remove")]
    public Task<IActionResult> RemoveSession(string sessionId, CancellationToken cancellationToken)
    {
        if (!SessionIdPattern().IsMatch(sessionId))
        {
            return Task.FromResult<IActionResult>(BadRequest("Invalid session id."));
        }

        return ForwardAsync(
            HttpMethod.Post,
            $"/session/{Uri.EscapeDataString(sessionId)}/logout-definitivo",
            $"removeu definitivamente a sessão {sessionId}",
            audit: true,
            cancellationToken);
    }

    private async Task<IActionResult> ForwardAsync(
        HttpMethod method,
        string bridgePath,
        string auditDescription,
        bool audit,
        CancellationToken cancellationToken)
    {
        if (!this.IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var (reachable, statusCode, body) = await bridgeClient.SendAdminRequestAsync(method, bridgePath, cancellationToken);

        if (audit)
        {
            logger.LogWarning(
                "SystemHealth: user {UserId} {Action} (bridge reachable={Reachable}, status={Status})",
                this.GetCurrentUserId(), auditDescription, reachable, statusCode);
        }

        if (!reachable)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { error = "Bridge não responde." });
        }

        return new ContentResult
        {
            StatusCode = statusCode,
            ContentType = "application/json",
            Content = string.IsNullOrWhiteSpace(body) ? "{}" : body,
        };
    }
}
