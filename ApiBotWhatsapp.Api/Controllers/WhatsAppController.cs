using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Services;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/whatsapp")]
public class WhatsAppController(WhatsAppBridgeClient bridgeClient) : ControllerBase
{
    // Every user has exactly one WhatsApp connection, identified by their own session id.
    // Never accepts a client-supplied session/id - always the caller's own.
    private string MySessionId => $"user-{this.GetCurrentUserId()}";

    [HttpGet("status")]
    public async Task<ActionResult<WhatsAppConnectionStatusResponse>> GetStatus(CancellationToken cancellationToken)
    {
        var status = await bridgeClient.GetSessionStatusAsync(MySessionId, cancellationToken);
        return Ok(status);
    }

    [HttpGet("qr")]
    public async Task<ActionResult<WhatsAppQrResponse>> GetQr(CancellationToken cancellationToken)
    {
        var qr = await bridgeClient.GetQrAsync(MySessionId, cancellationToken);
        return qr is null ? NotFound("QR not available.") : Ok(new WhatsAppQrResponse(qr));
    }

    [HttpPost("connect")]
    public async Task<ActionResult> Connect(CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.ConnectAsync(MySessionId, cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to start WhatsApp bridge.");
    }

    [HttpPost("disconnect")]
    public async Task<ActionResult> Disconnect(CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.DisconnectAsync(MySessionId, cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to disconnect WhatsApp bridge.");
    }

    // Emergency reset: for when the session is stuck showing "connected" but the WhatsApp
    // account was actually blocked/logged out on the other end, and a normal disconnect (or even
    // restarting the whole deploy) never clears it because the local session data on disk still
    // thinks it's linked and just reconnects to the same broken state. This forces a real logout,
    // wipes that local session data, and always leaves the user able to link a fresh QR/code.
    [HttpPost("reset")]
    public async Task<ActionResult> Reset(CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.ForceResetAsync(MySessionId, cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to reset WhatsApp session.");
    }

    [HttpPost("pairing-code")]
    public async Task<ActionResult<WhatsAppPairingCodeResponse>> PairingCode(
        [FromBody] WhatsAppPairingCodeRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            return BadRequest("PhoneNumber is required.");
        }

        var digits = new string(request.PhoneNumber.Where(char.IsDigit).ToArray());
        if (string.IsNullOrWhiteSpace(digits))
        {
            return BadRequest("PhoneNumber is invalid.");
        }

        var (code, error) = await bridgeClient.GetPairingCodeAsync(digits, MySessionId, cancellationToken);
        return string.IsNullOrWhiteSpace(code)
            ? BadRequest(error ?? "Unable to generate pairing code.")
            : Ok(new WhatsAppPairingCodeResponse(code));
    }
}
