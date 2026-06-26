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
public class BulkMessagesController(AppDbContext dbContext, WhatsAppMessageSender sender) : ControllerBase
{
    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    [HttpPost]
    public async Task<ActionResult<IEnumerable<BulkSendResult>>> Send([FromBody] BulkSendRequest req, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        // Resolve contacts: prioritize explicit ContactIds, then fall back to TurmaId
        IQueryable<Contato> contactsQuery;
        
        if (req.ContactIds is not null && req.ContactIds.Count > 0)
        {
            // If ContactIds are explicitly provided, use only those
            contactsQuery = dbContext.Contatos.Where(c => 
                c.CompanyId == companyId.Value && 
                req.ContactIds.Contains(c.Id));
        }
        else if (req.TurmaId > 0)
        {
            // Otherwise, use all contacts from the turma
            contactsQuery = dbContext.Contatos.Where(c => 
                c.CompanyId == companyId.Value && 
                c.TurmaId == req.TurmaId);
        }
        else
        {
            return BadRequest("Either TurmaId must be > 0 or ContactIds must be provided.");
        }

        var contacts = await contactsQuery.ToListAsync(cancellationToken);

        if (!contacts.Any()) return BadRequest($"No contacts found for turma/selection. (TurmaId: {req.TurmaId}, ContactIds: {req.ContactIds?.Count ?? 0})");

        var results = new List<BulkSendResult>();

        var greeting = string.IsNullOrWhiteSpace(req.Greeting) ? "Bom dia" : req.Greeting.Trim();
        var body = req.Message ?? string.Empty;

        foreach (var c in contacts)
        {
            var personalized = $"{greeting} {c.Name}!\n{body}";
            var normalizedPhone = PhoneNumberUtils.Normalize(c.PhoneNumber);
            var (success, status) = await sender.SendMessageAsync(normalizedPhone, personalized, req.MarkAsUnread, req.SourceWhatsAppNumber, cancellationToken);

            results.Add(new BulkSendResult(c.Id, c.PhoneNumber, success, status));
        }

        return Ok(results);
    }

    [HttpPost("send")]
    public async Task<IActionResult> SendMessage(
        [FromBody] SendMessageRequest request,
        [FromServices] ApiBotWhatsapp.Api.Services.WhatsAppMessageSender sender,
        CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized("Company not found in token.");

        var targetPhone = request.PhoneNumber; 
        var textMessage = request.Message;

        if (string.IsNullOrWhiteSpace(targetPhone) || string.IsNullOrWhiteSpace(textMessage))
        {
            return BadRequest("Telefone e Mensagem são obrigatórios.");
        }

        var normalizedPhone = ApiBotWhatsapp.Api.Utils.PhoneNumberUtils.Normalize(targetPhone);

        var sourceNumber = request.GetType().GetProperty("SourceWhatsAppNumber") != null 
            ? (string?)request.GetType().GetProperty("SourceWhatsAppNumber")?.GetValue(request, null) 
            : null;

        var (success, status) = await sender.SendMessageAsync(
            normalizedPhone, 
            textMessage, 
            false, // markAsUnread
            sourceNumber, 
            cancellationToken
        );

        if (!success) return BadRequest($"Falha ao enviar: {status}");

        var log = new ApiBotWhatsapp.Api.Models.MessageLog
        {
            CompanyId = companyId.Value,
            WhatsAppNumber = sourceNumber ?? string.Empty,
            PhoneNumber = normalizedPhone,
            Direction = "Outgoing",
            Content = textMessage,
            TimestampUtc = DateTime.UtcNow,
            Status = "Sent",
            IsAutomatic = false
        };

        dbContext.MessageLogs.Add(log);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new { success = true, status });
    }
}
