using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
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

        // Resolve contacts from turma or explicit ids
        var contactsQuery = dbContext.Contatos.Where(c => c.CompanyId == companyId.Value && c.TurmaId == req.TurmaId);

        if (req.ContactIds is not null && req.ContactIds.Count > 0)
        {
            contactsQuery = contactsQuery.Where(c => req.ContactIds.Contains(c.Id));
        }

        var contacts = await contactsQuery.ToListAsync(cancellationToken);

        if (!contacts.Any()) return BadRequest("No contacts found for the given turma/selection.");

        var results = new List<BulkSendResult>();

        var greeting = string.IsNullOrWhiteSpace(req.Greeting) ? "Bom dia" : req.Greeting.Trim();
        var body = req.Message ?? string.Empty;

        foreach (var c in contacts)
        {
            var personalized = $"{greeting} {c.Name}!\n{body}";
            var (success, status) = await sender.SendMessageAsync(c.PhoneNumber, personalized, req.MarkAsUnread, req.SourceWhatsAppNumber, cancellationToken);

            // Log could be added here (MessageLog) - keeping simple for now
            results.Add(new BulkSendResult(c.Id, c.PhoneNumber, success, status));
        }

        return Ok(results);
    }
}
