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
        var connections = await bridgeClient.GetConnectionsAsync(cancellationToken);
        if (connections.Count == 0)
        {
            return NotFound("WhatsApp bridge is not configured.");
        }

        return Ok(connections);
    }

    [HttpGet("status")]
    public async Task<ActionResult<WhatsAppConnectionStatusResponse>> GetStatus(CancellationToken cancellationToken)
    {
        var status = await bridgeClient.GetStatusAsync(cancellationToken);
        return status is null ? NotFound("WhatsApp bridge is not configured.") : Ok(status);
    }

    [HttpGet("qr")]
    public async Task<ActionResult<WhatsAppQrResponse>> GetQr([FromQuery] string? sessionId, CancellationToken cancellationToken)
    {
        var qr = await bridgeClient.GetQrAsync(sessionId, cancellationToken);
        return qr is null ? NotFound("QR not available.") : Ok(new WhatsAppQrResponse(qr));
    }

    [HttpPost("connections")]
    public async Task<ActionResult<WhatsAppCreateConnectionResponse>> CreateConnection(CancellationToken cancellationToken)
    {
        var id = await bridgeClient.CreateConnectionAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(id))
        {
            return BadRequest("Unable to create WhatsApp connection.");
        }

        var connected = await bridgeClient.ConnectAsync(id, cancellationToken);
        if (!connected)
        {
            return BadRequest("Unable to start WhatsApp connection.");
        }

        return Ok(new WhatsAppCreateConnectionResponse(id, "connecting"));
    }

    [HttpPost("connect")]
    public async Task<ActionResult> Connect([FromQuery] string? sessionId, CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.ConnectAsync(sessionId, cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to start WhatsApp bridge.");
    }

    [HttpPost("disconnect")]
    public async Task<ActionResult> Disconnect([FromQuery] string? sessionId, CancellationToken cancellationToken)
    {
        var ok = await bridgeClient.DisconnectAsync(sessionId, cancellationToken);
        return ok ? Accepted() : BadRequest("Unable to disconnect WhatsApp bridge.");
    }

    [HttpPost("pairing-code")]
    public async Task<ActionResult<WhatsAppPairingCodeResponse>> PairingCode(
        [FromBody] WhatsAppPairingCodeRequest request,
        [FromQuery] string? sessionId,
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

        var code = await bridgeClient.GetPairingCodeAsync(digits, sessionId, cancellationToken);
        return string.IsNullOrWhiteSpace(code)
            ? BadRequest("Unable to generate pairing code.")
            : Ok(new WhatsAppPairingCodeResponse(code));
    }
}
