using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Services;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

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

    private static bool ShouldAbortBulk(string status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return false;
        }

        var normalized = status.ToLowerInvariant();
        return normalized.Contains("block")
            || normalized.Contains("bloque")
            || normalized.Contains("ban")
            || normalized.Contains("forbidden")
            || normalized.Contains("unauthorized")
            || normalized.Contains("not connected")
            || normalized.Contains("disconnected")
            || normalized.Contains("session")
            || normalized.Contains("rate limit")
            || normalized.Contains("429")
            || normalized.Contains("403")
            || normalized.Contains("401");
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

        var greeting = string.IsNullOrWhiteSpace(req.Greeting) ? "Bom dia" : req.Greeting.Trim();
        var body = req.Message ?? string.Empty;
        var intervalSeconds = req.IntervalSeconds <= 0 ? 60 : req.IntervalSeconds;

        async Task<(List<BulkSendResult> Results, int SentCount, int FailedCount, bool Aborted, string? AbortReason)> ExecuteBulkAsync(Func<BulkSendStreamEvent, Task>? emitEvent)
        {
            var results = new List<BulkSendResult>();
            var sentCount = 0;
            var failedCount = 0;
            var aborted = false;
            string? abortReason = null;

            for (var index = 0; index < contacts.Count; index++)
            {
                var contact = contacts[index];

                if (emitEvent is not null)
                {
                    await emitEvent(new BulkSendStreamEvent(
                        Type: "sending",
                        ContactId: contact.Id,
                        PhoneNumber: contact.PhoneNumber,
                        Success: null,
                        Status: $"Enviando para {contact.Name}",
                        SentCount: sentCount,
                        FailedCount: failedCount,
                        RemainingCount: contacts.Count - index,
                        TotalCount: contacts.Count));
                }

                var personalized = $"{greeting} {contact.Name}!\n{body}";
                var normalizedPhone = PhoneNumberUtils.Normalize(contact.PhoneNumber);
                var (success, status) = await sender.SendMessageAsync(normalizedPhone, personalized, req.MarkAsUnread, req.SourceWhatsAppNumber, cancellationToken);

                if (success)
                {
                    sentCount++;
                }
                else
                {
                    failedCount++;
                }

                results.Add(new BulkSendResult(contact.Id, contact.PhoneNumber, success, status));

                if (emitEvent is not null)
                {
                    await emitEvent(new BulkSendStreamEvent(
                        Type: "result",
                        ContactId: contact.Id,
                        PhoneNumber: contact.PhoneNumber,
                        Success: success,
                        Status: status,
                        SentCount: sentCount,
                        FailedCount: failedCount,
                        RemainingCount: contacts.Count - index - 1,
                        TotalCount: contacts.Count));
                }

                if (!success && ShouldAbortBulk(status))
                {
                    aborted = true;
                    abortReason = status;

                    if (emitEvent is not null)
                    {
                        await emitEvent(new BulkSendStreamEvent(
                            Type: "aborted",
                            ContactId: contact.Id,
                            PhoneNumber: contact.PhoneNumber,
                            Success: false,
                            Status: status,
                            SentCount: sentCount,
                            FailedCount: failedCount,
                            RemainingCount: contacts.Count - index - 1,
                            TotalCount: contacts.Count,
                            Completed: true,
                            Aborted: true,
                            AbortReason: status));
                    }

                    break;
                }

                if (index < contacts.Count - 1)
                {
                    await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), cancellationToken);
                }
            }

            return (results, sentCount, failedCount, aborted, abortReason);
        }

        if (!req.StreamUpdates)
        {
            var (results, _, _, _, _) = await ExecuteBulkAsync(null);
            return Ok(results);
        }

        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "application/x-ndjson";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";

        await Response.StartAsync(cancellationToken);
        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        async Task WriteEventAsync(BulkSendStreamEvent bulkEvent)
        {
            await JsonSerializer.SerializeAsync(Response.Body, bulkEvent, jsonOptions, cancellationToken);
            await Response.WriteAsync("\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }

        var (_, sentCount, failedCount, aborted, abortReason) = await ExecuteBulkAsync(WriteEventAsync);

        if (!aborted)
        {
            await WriteEventAsync(new BulkSendStreamEvent(
                Type: "completed",
                ContactId: null,
                PhoneNumber: null,
                Success: null,
                Status: "Bulk send completed.",
                SentCount: sentCount,
                FailedCount: failedCount,
                RemainingCount: 0,
                TotalCount: contacts.Count,
                Completed: true,
                Aborted: false));
        }

        return new EmptyResult();
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
