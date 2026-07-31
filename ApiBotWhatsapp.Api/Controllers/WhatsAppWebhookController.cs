using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/webhooks/whatsapp")]
public class WhatsAppWebhookController(
    IConfiguration configuration,
    AutoReplyService autoReplyService,
    AppDbContext dbContext,
    ILogger<WhatsAppWebhookController> logger) : ControllerBase
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
            logger.LogWarning("Webhook rejected: invalid X-Webhook-Token.");
            return Unauthorized("Invalid webhook token.");
        }

        if (string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            return BadRequest("PhoneNumber is required.");
        }

        logger.LogInformation(
            "Webhook received: Phone={Phone} WhatsAppNumber={WaNumber} OwnerUserId={OwnerUserId} Direction={Direction} MessageId={MessageId}",
            request.PhoneNumber, request.WhatsAppNumber, request.OwnerUserId, request.Direction, request.MessageId);

        if (request.OwnerUserId is null)
        {
            // The bridge couldn't resolve which user's session this came from (e.g. a legacy
            // session id, or the session was never reconnected under the user-{id} scheme).
            // Without an owner we can't safely scope contacts/rules to anyone.
            logger.LogWarning(
                "Webhook skipped: could not resolve session owner for Phone={Phone} WhatsAppNumber={WaNumber}. " +
                "This usually means the connected WhatsApp session isn't a user-{{id}} session (reconnect it from Meu WhatsApp).",
                request.PhoneNumber, request.WhatsAppNumber);
            return Ok(new WhatsAppWebhookResponse(false, "Unable to resolve session owner. Message not processed.", null));
        }

        var normalizedRequest = request with
        {
            Message = string.IsNullOrWhiteSpace(request.Message) ? "[non-text message]" : request.Message
        };

        var result = await autoReplyService.ProcessIncomingMessageAsync(normalizedRequest, cancellationToken);

        logger.LogInformation(
            "Auto-reply decision for Phone={Phone} OwnerUserId={OwnerUserId}: AutoReplySent={Sent} Status=\"{Status}\"",
            request.PhoneNumber, request.OwnerUserId, result.AutoReplySent, result.Status);

        return Ok(result);
    }

    [HttpPost("ack")]
    [AllowAnonymous]
    public async Task<IActionResult> Ack(
        [FromBody] WhatsAppAckWebhookRequest request,
        [FromHeader(Name = "X-Webhook-Token")] string? webhookToken,
        CancellationToken cancellationToken)
    {
        var expectedToken = configuration["WhatsApp:WebhookToken"];
        if (string.IsNullOrWhiteSpace(expectedToken) || webhookToken != expectedToken)
        {
            return Unauthorized("Invalid webhook token.");
        }

        if (request.OwnerUserId is null || string.IsNullOrWhiteSpace(request.MessageId))
        {
            return Ok();
        }

        var log = await dbContext.MessageLogs.FirstOrDefaultAsync(
            item => item.OwnerUserId == request.OwnerUserId && item.MessageId == request.MessageId,
            cancellationToken);

        if (log is null)
        {
            return Ok();
        }

        log.AckStatus = request.AckStatus;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok();
    }
}
