using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/whatsapp")]
public class WhatsAppController(WhatsAppBridgeClient bridgeClient) : ControllerBase
{
    [HttpGet("connections")]
    public async Task<ActionResult<IEnumerable<WhatsAppConnectionItemResponse>>> GetConnections(CancellationToken cancellationToken)
    {
        var status = await bridgeClient.GetStatusAsync(cancellationToken);
        if (status is null)
        {
            return NotFound("WhatsApp bridge is not configured.");
        }

        var list = new[]
        {
            new WhatsAppConnectionItemResponse(
                "default",
                status.Status,
                status.IsConnected,
                status.HasQr,
                status.PhoneNumber,
                status.LastError)
        };

        return Ok(list);
    }

    [HttpGet("status")]
    public async Task<ActionResult<WhatsAppConnectionStatusResponse>> GetStatus(CancellationToken cancellationToken)
    {
        var status = await bridgeClient.GetStatusAsync(cancellationToken);
        return status is null ? NotFound("WhatsApp bridge is not configured.") : Ok(status);
    }

    [HttpGet("qr")]
    public async Task<ActionResult<WhatsAppQrResponse>> GetQr(CancellationToken cancellationToken)
    {
        var qr = await bridgeClient.GetQrAsync(cancellationToken);
        return qr is null ? NotFound("QR not available.") : Ok(new WhatsAppQrResponse(qr));
    }

    [HttpPost("connect")]
    public async Task<ActionResult> Connect(CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.ConnectAsync(cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to start WhatsApp bridge.");
    }

    [HttpPost("disconnect")]
    public async Task<ActionResult> Disconnect(CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.DisconnectAsync(cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to disconnect WhatsApp bridge.");
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

        var code = await bridgeClient.GetPairingCodeAsync(digits, cancellationToken);
        return string.IsNullOrWhiteSpace(code)
            ? BadRequest("Unable to generate pairing code.")
            : Ok(new WhatsAppPairingCodeResponse(code));
    }
}
