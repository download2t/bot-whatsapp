using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/messages")]
public class MessageLogsController(AppDbContext dbContext, WhatsAppBridgeClient bridgeClient) : ControllerBase
{
    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<MessageLogResponse>>> GetRecent([FromQuery] int take = 100, CancellationToken cancellationToken = default)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        take = Math.Clamp(take, 1, 500);

        var logs = await dbContext.MessageLogs
            .Where(item => item.CompanyId == companyId.Value)
            .OrderByDescending(item => item.TimestampUtc)
            .Take(take)
            .Select(item => new MessageLogResponse(
                item.Id,
                item.CompanyId,
                item.WhatsAppNumber,
                item.Direction,
                item.PhoneNumber,
                item.Content,
                item.IsAutomatic,
                item.Status,
                item.TimestampUtc))
            .ToListAsync(cancellationToken);

        return Ok(logs);
    }

    [HttpGet("search")]
    public async Task<ActionResult<PagedMessageLogResponse>> Search(
        [FromQuery] string? phoneNumber,
        [FromQuery] string? whatsAppNumber,
        [FromQuery] string? direction,
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 5, 100);

        var query = BuildQuery(companyId.Value, phoneNumber, whatsAppNumber, direction, startDate, endDate);

        var orderedQuery = ApplySorting(query, sortBy, sortOrder);

        var totalCount = await orderedQuery.CountAsync(cancellationToken);
        var items = await orderedQuery
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(item => new MessageLogResponse(
                item.Id,
                item.CompanyId,
                item.WhatsAppNumber,
                item.Direction,
                item.PhoneNumber,
                item.Content,
                item.IsAutomatic,
                item.Status,
                item.TimestampUtc))
            .ToListAsync(cancellationToken);

        return Ok(new PagedMessageLogResponse(items, totalCount, page, pageSize));
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? phoneNumber,
        [FromQuery] string? whatsAppNumber,
        [FromQuery] string? direction,
        [FromQuery] DateOnly? startDate,
        [FromQuery] DateOnly? endDate,
        [FromQuery] string? sortBy,
        [FromQuery] string? sortOrder,
        CancellationToken cancellationToken = default)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var query = ApplySorting(BuildQuery(companyId.Value, phoneNumber, whatsAppNumber, direction, startDate, endDate), sortBy, sortOrder);

        var items = await query
            .Select(item => new MessageLogResponse(
                item.Id,
                item.CompanyId,
                item.WhatsAppNumber,
                item.Direction,
                item.PhoneNumber,
                item.Content,
                item.IsAutomatic,
                item.Status,
                item.TimestampUtc))
            .ToListAsync(cancellationToken);

        var csv = new StringBuilder();
        csv.AppendLine("Id,CompanyId,WhatsAppNumber,Direction,PhoneNumber,Content,IsAutomatic,Status,TimestampUtc");

        foreach (var item in items)
        {
            csv.AppendLine(string.Join(",",
                item.Id,
                item.CompanyId,
                Csv(item.WhatsAppNumber),
                Csv(item.Direction),
                Csv(item.PhoneNumber),
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
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var todayStart = DateTime.UtcNow.Date;

        var totalIncoming = await dbContext.MessageLogs.CountAsync(item => item.CompanyId == companyId.Value && item.Direction == "Incoming", cancellationToken);
        var totalOutgoing = await dbContext.MessageLogs.CountAsync(item => item.CompanyId == companyId.Value && item.Direction == "Outgoing", cancellationToken);
        var totalAutomatic = await dbContext.MessageLogs.CountAsync(item => item.CompanyId == companyId.Value && item.IsAutomatic, cancellationToken);

        var todayIncoming = await dbContext.MessageLogs.CountAsync(
            item => item.CompanyId == companyId.Value && item.Direction == "Incoming" && item.TimestampUtc >= todayStart,
            cancellationToken);

        var todayOutgoing = await dbContext.MessageLogs.CountAsync(
            item => item.CompanyId == companyId.Value && item.Direction == "Outgoing" && item.TimestampUtc >= todayStart,
            cancellationToken);

        var todayAutomatic = await dbContext.MessageLogs.CountAsync(
            item => item.CompanyId == companyId.Value && item.IsAutomatic && item.TimestampUtc >= todayStart,
            cancellationToken);

        return Ok(new DashboardStatusResponse(
            totalIncoming,
            totalOutgoing,
            totalAutomatic,
            todayIncoming,
            todayOutgoing,
            todayAutomatic));
    }

    [HttpGet("whatsapp-options")]
    public async Task<ActionResult<WhatsAppFilterOptionsResponse>> GetWhatsAppOptions(CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var numbers = await dbContext.MessageLogs
            .Where(item => item.CompanyId == companyId.Value && item.WhatsAppNumber != string.Empty)
            .Select(item => item.WhatsAppNumber)
            .ToListAsync(cancellationToken);

        var ruleNumbers = await dbContext.ScheduleRuleWhatsAppNumbers
            .Where(item => dbContext.ScheduleRules.Any(rule => rule.Id == item.ScheduleRuleId && rule.CompanyId == companyId.Value))
            .Select(item => item.WhatsAppNumber)
            .ToListAsync(cancellationToken);

        var legacyRuleNumbers = await dbContext.ScheduleRules
            .Where(item => item.CompanyId == companyId.Value && item.WhatsAppNumber != string.Empty)
            .Select(item => item.WhatsAppNumber)
            .ToListAsync(cancellationToken);

        numbers = numbers
            .Concat(ruleNumbers)
            .Concat(legacyRuleNumbers)
            .Concat((await bridgeClient.GetConnectionsAsync(cancellationToken))
                .Where(item => item.IsConnected && !string.IsNullOrWhiteSpace(item.PhoneNumber))
                .Select(item => item.PhoneNumber!))
            .Distinct()
            .OrderBy(item => item)
            .ToList();

        return Ok(new WhatsAppFilterOptionsResponse(numbers, null));
    }

    private IQueryable<ApiBotWhatsapp.Api.Models.MessageLog> BuildQuery(
        int companyId,
        string? phoneNumber,
        string? whatsAppNumber,
        string? direction,
        DateOnly? startDate,
        DateOnly? endDate)
    {
        var query = dbContext.MessageLogs.AsNoTracking().Where(item => item.CompanyId == companyId).AsQueryable();

        if (!string.IsNullOrWhiteSpace(whatsAppNumber))
        {
            var normalizedWhatsApp = new string(whatsAppNumber.Where(char.IsDigit).ToArray());
            if (!string.IsNullOrWhiteSpace(normalizedWhatsApp))
            {
                query = query.Where(item => item.WhatsAppNumber == normalizedWhatsApp);
            }
        }

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
