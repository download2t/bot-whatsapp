using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/webhooks/whatsapp")]
public class WhatsAppWebhookController(IConfiguration configuration, AutoReplyService autoReplyService) : ControllerBase
{
    [HttpPost]
    [AllowAnonymous]
    public async Task<ActionResult<WhatsAppWebhookResponse>> Receive(
        [FromBody] WhatsAppWebhookRequest request,
        [FromHeader(Name = "X-Webhook-Token")] string? webhookToken,
        CancellationToken cancellationToken)
    {
        var expectedToken = configuration["WhatsApp:WebhookToken"];
        if (string.IsNullOrWhiteSpace(expectedToken) || webhookToken != expectedToken)
        {
            return Unauthorized("Invalid webhook token.");
        }

        if (string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            return BadRequest("PhoneNumber is required.");
        }

        var normalizedRequest = request with
        {
            Message = string.IsNullOrWhiteSpace(request.Message) ? "[non-text message]" : request.Message
        };

        var result = await autoReplyService.ProcessIncomingMessageAsync(normalizedRequest, cancellationToken);
        return Ok(result);
    }
}
