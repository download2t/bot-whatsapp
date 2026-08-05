using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Services;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/messages/bulk")]
public class BulkMessagesController(
    AppDbContext dbContext,
    WhatsAppMessageSender sender,
    WhatsAppBridgeClient bridgeClient,
    MediaStorageService mediaStorage,
    BulkCampaignRunner campaignRunner) : ControllerBase
{
    // ~20MB binary encoded as base64 (base64 is ~4/3 the size of the raw bytes).
    private const int MaxMediaBase64Length = 27_000_000;

    private static BulkCampaignItemResponse ToItemResponse(BulkCampaignItem item) => new(
        item.Id,
        item.ContactId,
        item.ContactName,
        item.PhoneNumber,
        item.Status,
        item.StatusDetail,
        item.ProcessedAtUtc);

    private static BulkCampaignResponse ToResponse(BulkCampaign campaign) => new(
        campaign.Id,
        campaign.Greeting,
        campaign.MessageTemplate,
        campaign.IntervalSeconds,
        campaign.MediaUrl,
        campaign.MediaMimeType,
        campaign.MediaFileName,
        campaign.Status,
        campaign.AbortReason,
        campaign.TotalCount,
        campaign.SentCount,
        campaign.FailedCount,
        campaign.CreatedAtUtc,
        campaign.FinishedAtUtc,
        campaign.Items.OrderBy(i => i.Id).Select(ToItemResponse).ToList());

    [HttpPost]
    [RequestSizeLimit(40_000_000)]
    public async Task<ActionResult<BulkCampaignResponse>> Send([FromBody] BulkSendRequest req, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        if (!string.IsNullOrEmpty(req.MediaBase64) && req.MediaBase64.Length > MaxMediaBase64Length)
        {
            return BadRequest("Arquivo excede o limite de 20MB.");
        }

        // Resolve contacts: prioritize explicit ContactIds, then fall back to TurmaId
        IQueryable<Contato> contactsQuery = dbContext.Contatos.Where(c => c.OwnerUserId == ownerUserId);

        if (req.ContactIds is not null && req.ContactIds.Count > 0)
        {
            contactsQuery = contactsQuery.Where(c => req.ContactIds.Contains(c.Id));
        }
        else if (req.TurmaId > 0)
        {
            contactsQuery = contactsQuery.Where(c => c.TurmaId == req.TurmaId);
        }
        else
        {
            return BadRequest("Either TurmaId must be > 0 or ContactIds must be provided.");
        }

        var contacts = await contactsQuery.ToListAsync(cancellationToken);

        if (!contacts.Any()) return BadRequest($"No contacts found for turma/selection. (TurmaId: {req.TurmaId}, ContactIds: {req.ContactIds?.Count ?? 0})");

        var greeting = string.IsNullOrWhiteSpace(req.Greeting) ? "Bom dia" : req.Greeting.Trim();
        var intervalSeconds = req.IntervalSeconds <= 0 ? 60 : req.IntervalSeconds;

        string? mediaUrl = null;
        if (!string.IsNullOrEmpty(req.MediaBase64))
        {
            mediaUrl = mediaStorage.SaveBase64(ownerUserId, req.MediaBase64, req.MediaMimeType, req.MediaFileName);
        }

        var campaign = new BulkCampaign
        {
            OwnerUserId = ownerUserId,
            TurmaId = req.TurmaId > 0 ? req.TurmaId : null,
            Greeting = greeting,
            MessageTemplate = req.Message ?? string.Empty,
            IntervalSeconds = intervalSeconds,
            MarkAsUnread = req.MarkAsUnread,
            MediaUrl = mediaUrl,
            MediaMimeType = !string.IsNullOrEmpty(req.MediaBase64) ? req.MediaMimeType : null,
            MediaFileName = !string.IsNullOrEmpty(req.MediaBase64) ? req.MediaFileName : null,
            Status = "Running",
            TotalCount = contacts.Count,
        };

        campaign.Items = contacts.Select(contact => new BulkCampaignItem
        {
            ContactId = contact.Id,
            ContactName = contact.Name,
            PhoneNumber = contact.PhoneNumber,
            Status = "Pending",
        }).ToList();

        dbContext.BulkCampaigns.Add(campaign);
        await dbContext.SaveChangesAsync(cancellationToken);

        campaignRunner.Start(campaign.Id, req.MediaBase64);

        return StatusCode(StatusCodes.Status202Accepted, ToResponse(campaign));
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<BulkCampaignListItemResponse>>> List(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var items = await dbContext.BulkCampaigns
            .Where(c => c.OwnerUserId == ownerUserId)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Select(c => new BulkCampaignListItemResponse(
                c.Id,
                c.MessageTemplate,
                c.Status,
                c.TotalCount,
                c.SentCount,
                c.FailedCount,
                c.CreatedAtUtc,
                c.FinishedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(items);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BulkCampaignResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var campaign = await dbContext.BulkCampaigns
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == id && c.OwnerUserId == ownerUserId, cancellationToken);

        if (campaign is null) return NotFound();

        return Ok(ToResponse(campaign));
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<ActionResult<BulkCampaignResponse>> Cancel(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var campaign = await dbContext.BulkCampaigns
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == id && c.OwnerUserId == ownerUserId, cancellationToken);

        if (campaign is null) return NotFound();

        if (campaign.Status != "Running")
        {
            return Ok(ToResponse(campaign));
        }

        var cancelledInMemory = campaignRunner.TryCancel(id);

        if (!cancelledInMemory)
        {
            // No in-memory job found (e.g. the API restarted since this campaign started) —
            // finalize it here directly so the cancel button always works.
            foreach (var item in campaign.Items.Where(i => i.Status == "Pending" || i.Status == "Sending"))
            {
                item.Status = "Cancelled";
                item.StatusDetail = "Cancelado pelo usuário.";
                item.ProcessedAtUtc = DateTime.UtcNow;
            }

            campaign.Status = "Cancelled";
            campaign.FinishedAtUtc = DateTime.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return Ok(ToResponse(campaign));
    }

    [HttpPost("send")]
    [RequestSizeLimit(40_000_000)]
    public async Task<IActionResult> SendMessage(
        [FromBody] SendMessageRequest request,
        CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();
        var senderSessionId = $"user-{ownerUserId}";

        var targetPhone = request.PhoneNumber;
        var textMessage = request.Message ?? string.Empty;
        var hasMedia = !string.IsNullOrEmpty(request.MediaBase64);

        if (string.IsNullOrWhiteSpace(targetPhone) || (string.IsNullOrWhiteSpace(textMessage) && !hasMedia))
        {
            return BadRequest("Telefone e (Mensagem ou Mídia) são obrigatórios.");
        }

        if (hasMedia && request.MediaBase64!.Length > MaxMediaBase64Length)
        {
            return BadRequest("Arquivo excede o limite de 20MB.");
        }

        var normalizedPhone = PhoneNumberUtils.Normalize(targetPhone);

        var (success, status, messageId, _) = await sender.SendMessageAsync(
            normalizedPhone,
            textMessage,
            false, // markAsUnread
            senderSessionId,
            cancellationToken,
            request.MediaBase64,
            request.MediaMimeType,
            request.MediaFileName
        );

        if (!success) return BadRequest($"Falha ao enviar: {status}");

        var myStatus = await bridgeClient.GetSessionStatusAsync(senderSessionId, cancellationToken);

        // Save the exact file that was sent so it can be shown again in the chat history —
        // before this, only a "[Mídia: filename]" text placeholder was kept and the actual
        // image/video/document was discarded once the bridge call returned.
        string? mediaUrl = null;
        if (hasMedia)
        {
            mediaUrl = mediaStorage.SaveBase64(ownerUserId, request.MediaBase64!, request.MediaMimeType, request.MediaFileName);
        }

        var log = new MessageLog
        {
            OwnerUserId = ownerUserId,
            WhatsAppNumber = myStatus.PhoneNumber ?? string.Empty,
            PhoneNumber = normalizedPhone,
            Direction = "Outgoing",
            Content = textMessage,
            MediaUrl = mediaUrl,
            MediaMimeType = hasMedia ? request.MediaMimeType : null,
            MediaFileName = hasMedia ? request.MediaFileName : null,
            MessageId = messageId,
            TimestampUtc = DateTime.UtcNow,
            Status = "Sent",
            IsAutomatic = false
        };

        dbContext.MessageLogs.Add(log);

        // A manual reply means a human has taken over — drop any in-progress chat-flow
        // conversation for this contact so their next message isn't misread as a flow answer
        // (e.g. "1"/"2") instead of a normal reply to the operator.
        var activeConversation = await dbContext.ChatFlowConversations
            .FirstOrDefaultAsync(c => c.OwnerUserId == ownerUserId && c.PhoneNumber == normalizedPhone, cancellationToken);
        if (activeConversation is not null)
        {
            dbContext.ChatFlowConversations.Remove(activeConversation);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new { success = true, status });
    }
}
