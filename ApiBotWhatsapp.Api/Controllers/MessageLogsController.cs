using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Services;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/messages")]
public class MessageLogsController(AppDbContext dbContext, ConversationInboxService conversationInbox) : ControllerBase
{
    // Phone numbers whose conversation had an automatic message (rule text or chat-flow step)
    // sent since the operator last opened it in /messages — drives the "não lida" badge in the
    // sidebar. Unrelated to WhatsApp's own read receipts.
    [HttpGet("pending-review")]
    public async Task<ActionResult<IEnumerable<string>>> GetPendingReview(CancellationToken cancellationToken)
    {
        var phones = await conversationInbox.GetPendingReviewPhonesAsync(this.GetCurrentUserId(), cancellationToken);
        return Ok(phones);
    }

    [HttpPost("mark-read")]
    public async Task<ActionResult> MarkRead([FromBody] MarkConversationReadRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            return BadRequest("PhoneNumber is required.");
        }

        await conversationInbox.MarkReadAsync(this.GetCurrentUserId(), request.PhoneNumber, cancellationToken);
        return NoContent();
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MessageLogResponse>>> GetRecent([FromQuery] int take = 100, CancellationToken cancellationToken = default)
    {
        var ownerUserId = this.GetCurrentUserId();
        take = Math.Clamp(take, 1, 500);

        var logs = await dbContext.MessageLogs
            .Where(item => item.OwnerUserId == ownerUserId)
            .OrderByDescending(item => item.TimestampUtc)
            .Take(take)
            .Select(log => new MessageLogResponse(
                log.Id,
                log.WhatsAppNumber,
                log.Direction,
                log.PhoneNumber,
                log.ContactName,
                log.Content,
                log.IsAutomatic,
                log.Status,
                log.TimestampUtc,
                log.MediaUrl,
                log.MediaMimeType,
                log.MediaFileName,
                log.AckStatus
            ))
            .ToListAsync(cancellationToken);

        return Ok(logs);
    }

    [HttpGet("search")]
    public async Task<ActionResult<PagedMessageLogResponse>> Search(
        [FromQuery] string? phoneNumber,
        [FromQuery] string? direction,
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 5, 100);

        var query = BuildQuery(this.GetCurrentUserId(), phoneNumber, direction, startDate, endDate);
        var orderedQuery = ApplySorting(query, sortBy, sortOrder);

        var totalCount = await orderedQuery.CountAsync(cancellationToken);

        var items = await orderedQuery
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(log => new MessageLogResponse(
                log.Id,
                log.WhatsAppNumber,
                log.Direction,
                log.PhoneNumber,
                log.ContactName,
                log.Content,
                log.IsAutomatic,
                log.Status,
                log.TimestampUtc,
                log.MediaUrl,
                log.MediaMimeType,
                log.MediaFileName,
                log.AckStatus
            ))
            .ToListAsync(cancellationToken);

        return Ok(new PagedMessageLogResponse(items, totalCount, page, pageSize));
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? phoneNumber,
        [FromQuery] string? direction,
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        CancellationToken cancellationToken = default)
    {
        var query = ApplySorting(BuildQuery(this.GetCurrentUserId(), phoneNumber, direction, startDate, endDate), sortBy, sortOrder);

        var items = await query
            .Select(log => new MessageLogResponse(
                log.Id,
                log.WhatsAppNumber,
                log.Direction,
                log.PhoneNumber,
                log.ContactName,
                log.Content,
                log.IsAutomatic,
                log.Status,
                log.TimestampUtc,
                log.MediaUrl,
                log.MediaMimeType,
                log.MediaFileName,
                log.AckStatus
            ))
            .ToListAsync(cancellationToken);

        var csv = new StringBuilder();
        csv.AppendLine("Id,WhatsAppNumber,Direction,PhoneNumber,ContactName,Content,IsAutomatic,Status,TimestampUtc");

        foreach (var item in items)
        {
            csv.AppendLine(string.Join(",",
                item.Id,
                Csv(item.WhatsAppNumber),
                Csv(item.Direction),
                Csv(item.PhoneNumber),
                Csv(item.ContactName ?? string.Empty),
                Csv(item.Content),
                item.IsAutomatic ? "true" : "false",
                Csv(item.Status),
                item.TimestampUtc.ToString("yyyy-MM-dd HH:mm:ss")));
        }

        var bytes = Encoding.UTF8.GetBytes(csv.ToString());
        return File(bytes, "text/csv", $"messages-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv");
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<DashboardStatusResponse>> GetDashboard(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();
        var todayStart = DateTime.UtcNow.Date;

        var totalIncoming = await dbContext.MessageLogs.CountAsync(item => item.OwnerUserId == ownerUserId && item.Direction == "Incoming", cancellationToken);
        var totalOutgoing = await dbContext.MessageLogs.CountAsync(item => item.OwnerUserId == ownerUserId && item.Direction == "Outgoing", cancellationToken);
        var totalAutomatic = await dbContext.MessageLogs.CountAsync(item => item.OwnerUserId == ownerUserId && item.IsAutomatic, cancellationToken);

        var todayIncoming = await dbContext.MessageLogs.CountAsync(
            item => item.OwnerUserId == ownerUserId && item.Direction == "Incoming" && item.TimestampUtc >= todayStart,
            cancellationToken);

        var todayOutgoing = await dbContext.MessageLogs.CountAsync(
            item => item.OwnerUserId == ownerUserId && item.Direction == "Outgoing" && item.TimestampUtc >= todayStart,
            cancellationToken);

        var todayAutomatic = await dbContext.MessageLogs.CountAsync(
            item => item.OwnerUserId == ownerUserId && item.IsAutomatic && item.TimestampUtc >= todayStart,
            cancellationToken);

        return Ok(new DashboardStatusResponse(
            totalIncoming,
            totalOutgoing,
            totalAutomatic,
            todayIncoming,
            todayOutgoing,
            todayAutomatic));
    }

    private IQueryable<ApiBotWhatsapp.Api.Models.MessageLog> BuildQuery(
        int ownerUserId,
        string? phoneNumber,
        string? direction,
        DateOnly? startDate,
        DateOnly? endDate)
    {
        var query = dbContext.MessageLogs.AsNoTracking().Where(item => item.OwnerUserId == ownerUserId);

        if (!string.IsNullOrWhiteSpace(phoneNumber))
        {
            var digits = new string(phoneNumber.Where(char.IsDigit).ToArray());
            if (!string.IsNullOrWhiteSpace(digits))
            {
                query = query.Where(item => item.PhoneNumber.Contains(digits));
            }
        }

        if (!string.IsNullOrWhiteSpace(direction) &&
            (direction.Equals("Incoming", StringComparison.OrdinalIgnoreCase) ||
             direction.Equals("Outgoing", StringComparison.OrdinalIgnoreCase)))
        {
            query = query.Where(item => item.Direction == direction);
        }

        if (startDate.HasValue)
        {
            var start = startDate.Value.ToDateTime(TimeOnly.MinValue);
            query = query.Where(item => item.TimestampUtc >= start);
        }

        if (endDate.HasValue)
        {
            var endExclusive = endDate.Value.ToDateTime(TimeOnly.MinValue).AddDays(1);
            query = query.Where(item => item.TimestampUtc < endExclusive);
        }

        return query;
    }

    private static IQueryable<ApiBotWhatsapp.Api.Models.MessageLog> ApplySorting(
        IQueryable<ApiBotWhatsapp.Api.Models.MessageLog> query,
        string? sortBy,
        string? sortOrder)
    {
        var descending = !string.Equals(sortOrder, "asc", StringComparison.OrdinalIgnoreCase);
        var field = string.IsNullOrWhiteSpace(sortBy) ? "TimestampUtc" : sortBy;

        return field.ToLowerInvariant() switch
        {
            "phone" => descending ? query.OrderByDescending(item => item.PhoneNumber) : query.OrderBy(item => item.PhoneNumber),
            "direction" => descending ? query.OrderByDescending(item => item.Direction) : query.OrderBy(item => item.Direction),
            _ => descending ? query.OrderByDescending(item => item.TimestampUtc) : query.OrderBy(item => item.TimestampUtc),
        };
    }

    private static string Csv(string value)
    {
        return $"\"{(value ?? string.Empty).Replace("\"", "\"\"")}\"";
    }
}
