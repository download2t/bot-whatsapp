using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text.Json;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/schedule-rules")]
public class ScheduleRulesController(AppDbContext dbContext, WhatsAppBridgeClient bridgeClient) : ControllerBase
{
    private static readonly JsonSerializerOptions WindowsJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] DayNames = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado"
    ];

    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    private static string GetDayName(int dayOfWeek)
    {
        return dayOfWeek >= 0 && dayOfWeek < DayNames.Length ? DayNames[dayOfWeek] : dayOfWeek.ToString(CultureInfo.InvariantCulture);
    }

    private static bool TryParseTime(string input, out TimeSpan value)
    {
        return TimeSpan.TryParseExact(input, @"hh\:mm", CultureInfo.InvariantCulture, out value);
    }

    private static bool TryNormalizeWindows(
        IReadOnlyList<ScheduleRuleTimeWindowRequest>? windows,
        string fallbackStart,
        string fallbackEnd,
        out List<ScheduleRuleTimeWindowRequest> normalized,
        out string? error)
    {
        normalized = [];
        error = null;

        if (windows is { Count: > 0 })
        {
            foreach (var window in windows)
            {
                if (!Enum.IsDefined(typeof(DayOfWeek), window.DayOfWeek))
                {
                    error = $"Invalid DayOfWeek value: {window.DayOfWeek}.";
                    return false;
                }

                if (!TryParseTime(window.StartTime, out _) || !TryParseTime(window.EndTime, out _))
                {
                    error = "Weekly windows must use HH:mm time format.";
                    return false;
                }

                normalized.Add(new ScheduleRuleTimeWindowRequest(window.DayOfWeek, window.StartTime.Trim(), window.EndTime.Trim()));
            }

            normalized = normalized
                .OrderBy(window => window.DayOfWeek)
                .ThenBy(window => window.StartTime)
                .ToList();

            return true;
        }

        if (!TryParseTime(fallbackStart, out _) || !TryParseTime(fallbackEnd, out _))
        {
            error = "StartTime and EndTime must be in HH:mm format.";
            return false;
        }

        var legacyStart = fallbackStart.Trim();
        var legacyEnd = fallbackEnd.Trim();
        normalized = Enumerable.Range(0, 7)
            .Select(day => new ScheduleRuleTimeWindowRequest(day, legacyStart, legacyEnd))
            .ToList();

        return true;
    }

    private static List<ScheduleRuleTimeWindowRequest> GetLegacyWindows(ScheduleRule rule)
    {
        var start = rule.StartTime.ToString(@"hh\:mm");
        var end = rule.EndTime.ToString(@"hh\:mm");
        return Enumerable.Range(0, 7)
            .Select(day => new ScheduleRuleTimeWindowRequest(day, start, end))
            .ToList();
    }

    private static List<ScheduleRuleTimeWindowRequest> GetRuleWindows(ScheduleRule rule)
    {
        if (!string.IsNullOrWhiteSpace(rule.ScheduleWindowsJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<ScheduleRuleTimeWindowRequest>>(rule.ScheduleWindowsJson, WindowsJsonOptions);
                if (parsed is { Count: > 0 })
                {
                    return parsed
                        .Where(window => Enum.IsDefined(typeof(DayOfWeek), window.DayOfWeek))
                        .Where(window => TryParseTime(window.StartTime, out _) && TryParseTime(window.EndTime, out _))
                        .OrderBy(window => window.DayOfWeek)
                        .ThenBy(window => window.StartTime)
                        .ToList();
                }
            }
            catch
            {
                // Fall back to the legacy fields below.
            }
        }

        return GetLegacyWindows(rule);
    }

    private static string SerializeWindows(IEnumerable<ScheduleRuleTimeWindowRequest> windows)
    {
        return JsonSerializer.Serialize(windows, WindowsJsonOptions);
    }

    private async Task<bool> IsUserGestorOfCompanyAsync(int companyId, CancellationToken cancellationToken)
    {
        // Admins têm acesso completo
        var adminClaim = User.FindFirst("is_admin")?.Value;
        if (string.Equals(adminClaim, "true", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Não admins: verificar se é Gestor
        var userIdClaim = User.FindFirst("sub")?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
        {
            return false;
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null || user.Title != "Gestor")
        {
            return false;
        }

        // Verificar se está vinculado à empresa
        var isLinked = await dbContext.UserCompanies.AnyAsync(
            uc => uc.UserId == userId && uc.CompanyId == companyId,
            cancellationToken);

        return isLinked;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ScheduleRuleResponse>>> GetAll([FromQuery] string? whatsAppNumber, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var query = dbContext.ScheduleRules.Where(rule => rule.CompanyId == companyId.Value);
        if (!string.IsNullOrWhiteSpace(whatsAppNumber))
        {
            var normalized = new string(whatsAppNumber.Where(char.IsDigit).ToArray());
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                query = query.Where(rule =>
                    dbContext.ScheduleRuleWhatsAppNumbers.Any(item => item.ScheduleRuleId == rule.Id && item.WhatsAppNumber == normalized)
                    || (rule.WhatsAppNumber == normalized && !dbContext.ScheduleRuleWhatsAppNumbers.Any(item => item.ScheduleRuleId == rule.Id)));
            }
        }

        var rules = await query
            .OrderBy(rule => rule.StartTime)
            .ToListAsync(cancellationToken);

        var responses = await BuildResponsesAsync(rules, cancellationToken);

        return Ok(responses);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ScheduleRuleResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id && item.CompanyId == companyId.Value, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        var responses = await BuildResponsesAsync([rule], cancellationToken);
        return Ok(responses[0]);
    }

    [HttpPost]
    public async Task<ActionResult<ScheduleRuleResponse>> Create([FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can create schedule rules
        var isGestor = await IsUserGestorOfCompanyAsync(companyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can create schedule rules.");
        }

        if (!TryNormalizeWindows(request.Windows, request.StartTime, request.EndTime, out var normalizedWindows, out var windowError))
        {
            return BadRequest(windowError);
        }

        var normalizedWhatsApps = NormalizeWhatsAppNumbers(request.WhatsAppNumbers, request.WhatsAppNumber);
        if (normalizedWhatsApps.Count == 0)
        {
            return BadRequest("At least one WhatsApp number is required.");
        }

        var rule = new ScheduleRule
        {
            CompanyId = companyId.Value,
            Name = request.Name.Trim(),
            WhatsAppNumber = normalizedWhatsApps[0],
            StartTime = TimeSpan.ParseExact(normalizedWindows[0].StartTime, @"hh\:mm", CultureInfo.InvariantCulture),
            EndTime = TimeSpan.ParseExact(normalizedWindows[0].EndTime, @"hh\:mm", CultureInfo.InvariantCulture),
            ScheduleWindowsJson = SerializeWindows(normalizedWindows),
            Message = request.Message.Trim(),
            IsEnabled = request.IsEnabled,
            ThrottleMinutes = request.ThrottleMinutes,
            IsOutOfBusinessHours = request.IsOutOfBusinessHours,
            MaxDailyMessagesPerUser = request.MaxDailyMessagesPerUser,
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.ScheduleRules.Add(rule);
        await dbContext.SaveChangesAsync(cancellationToken);

        var mappings = normalizedWhatsApps
            .Select(item => new ScheduleRuleWhatsAppNumber
            {
                ScheduleRuleId = rule.Id,
                WhatsAppNumber = item,
            })
            .ToList();
        dbContext.ScheduleRuleWhatsAppNumbers.AddRange(mappings);
        await dbContext.SaveChangesAsync(cancellationToken);

        var responses = await BuildResponsesAsync([rule], cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = rule.Id }, responses[0]);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ScheduleRuleResponse>> Update(int id, [FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can update schedule rules
        var isGestor = await IsUserGestorOfCompanyAsync(companyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can update schedule rules.");
        }

        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id && item.CompanyId == companyId.Value, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        if (!TryNormalizeWindows(request.Windows, request.StartTime, request.EndTime, out var normalizedWindows, out var windowError))
        {
            return BadRequest(windowError);
        }

        var normalizedWhatsApps = NormalizeWhatsAppNumbers(request.WhatsAppNumbers, request.WhatsAppNumber);
        if (normalizedWhatsApps.Count == 0)
        {
            return BadRequest("At least one WhatsApp number is required.");
        }

        rule.Name = request.Name.Trim();
        rule.WhatsAppNumber = normalizedWhatsApps[0];
        rule.StartTime = TimeSpan.ParseExact(normalizedWindows[0].StartTime, @"hh\:mm", CultureInfo.InvariantCulture);
        rule.EndTime = TimeSpan.ParseExact(normalizedWindows[0].EndTime, @"hh\:mm", CultureInfo.InvariantCulture);
        rule.ScheduleWindowsJson = SerializeWindows(normalizedWindows);
        rule.Message = request.Message.Trim();
        rule.IsEnabled = request.IsEnabled;
        rule.ThrottleMinutes = request.ThrottleMinutes;
        rule.IsOutOfBusinessHours = request.IsOutOfBusinessHours;
        rule.MaxDailyMessagesPerUser = request.MaxDailyMessagesPerUser;

        var currentMappings = await dbContext.ScheduleRuleWhatsAppNumbers
            .Where(item => item.ScheduleRuleId == rule.Id)
            .ToListAsync(cancellationToken);
        dbContext.ScheduleRuleWhatsAppNumbers.RemoveRange(currentMappings);
        dbContext.ScheduleRuleWhatsAppNumbers.AddRange(
            normalizedWhatsApps.Select(item => new ScheduleRuleWhatsAppNumber
            {
                ScheduleRuleId = rule.Id,
                WhatsAppNumber = item,
            }));

        await dbContext.SaveChangesAsync(cancellationToken);
        var responses = await BuildResponsesAsync([rule], cancellationToken);
        return Ok(responses[0]);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can delete schedule rules
        var isGestor = await IsUserGestorOfCompanyAsync(companyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can delete schedule rules.");
        }

        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id && item.CompanyId == companyId.Value, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        var mappings = await dbContext.ScheduleRuleWhatsAppNumbers
            .Where(item => item.ScheduleRuleId == rule.Id)
            .ToListAsync(cancellationToken);
        if (mappings.Count > 0)
        {
            dbContext.ScheduleRuleWhatsAppNumbers.RemoveRange(mappings);
        }

        dbContext.ScheduleRules.Remove(rule);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("whatsapp-options")]
    public async Task<ActionResult<WhatsAppFilterOptionsResponse>> GetWhatsAppOptions(CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var numbers = await dbContext.ScheduleRuleWhatsAppNumbers
            .Where(item => dbContext.ScheduleRules.Any(rule => rule.Id == item.ScheduleRuleId && rule.CompanyId == companyId.Value))
            .Select(item => item.WhatsAppNumber)
            .ToListAsync(cancellationToken);

        var legacyRuleNumbers = await dbContext.ScheduleRules
            .Where(item => item.CompanyId == companyId.Value && item.WhatsAppNumber != string.Empty)
            .Select(item => item.WhatsAppNumber)
            .ToListAsync(cancellationToken);

        var messageNumbers = await dbContext.MessageLogs
            .Where(item => item.CompanyId == companyId.Value && item.WhatsAppNumber != string.Empty)
            .Select(item => item.WhatsAppNumber)
            .ToListAsync(cancellationToken);

        numbers = numbers
            .Concat(legacyRuleNumbers)
            .Concat(messageNumbers)
            .Concat((await bridgeClient.GetConnectionsAsync(cancellationToken))
                .Where(item => item.IsConnected && !string.IsNullOrWhiteSpace(item.PhoneNumber))
                .Select(item => item.PhoneNumber!))
            .Distinct()
            .OrderBy(item => item)
            .ToList();

        return Ok(new WhatsAppFilterOptionsResponse(numbers, null));
    }

    private async Task<List<ScheduleRuleResponse>> BuildResponsesAsync(List<ScheduleRule> rules, CancellationToken cancellationToken)
    {
        var ids = rules.Select(item => item.Id).ToList();
        var mappings = await dbContext.ScheduleRuleWhatsAppNumbers
            .Where(item => ids.Contains(item.ScheduleRuleId))
            .ToListAsync(cancellationToken);

        var mapByRule = mappings
            .GroupBy(item => item.ScheduleRuleId)
            .ToDictionary(
                group => group.Key,
                group => group.Select(item => item.WhatsAppNumber).Distinct().OrderBy(item => item).ToList());

        var responses = new List<ScheduleRuleResponse>(rules.Count);
        foreach (var rule in rules)
        {
            var numbers = mapByRule.TryGetValue(rule.Id, out var mapped)
                ? mapped
                : [rule.WhatsAppNumber];

            var windows = GetRuleWindows(rule)
                .Select(window => new ScheduleRuleTimeWindowResponse(
                    window.DayOfWeek,
                    GetDayName(window.DayOfWeek),
                    window.StartTime,
                    window.EndTime))
                .ToList();

            responses.Add(new ScheduleRuleResponse(
                rule.Id,
                rule.Name,
                numbers,
                numbers.FirstOrDefault() ?? rule.WhatsAppNumber,
                windows.FirstOrDefault()?.StartTime ?? rule.StartTime.ToString(@"hh\:mm"),
                windows.FirstOrDefault()?.EndTime ?? rule.EndTime.ToString(@"hh\:mm"),
                rule.Message,
                rule.IsEnabled,
                rule.ThrottleMinutes,
                rule.IsOutOfBusinessHours,
                rule.MaxDailyMessagesPerUser,
                rule.CreatedAtUtc,
                windows));
        }

        return responses;
    }

    private static List<string> NormalizeWhatsAppNumbers(IReadOnlyList<string>? numbers, string? legacyNumber)
    {
        var normalized = new List<string>();

        if (numbers is not null)
        {
            foreach (var number in numbers)
            {
                var digits = new string((number ?? string.Empty).Where(char.IsDigit).ToArray());
                if (!string.IsNullOrWhiteSpace(digits))
                {
                    normalized.Add(digits);
                }
            }
        }

        if (normalized.Count == 0)
        {
            var legacyDigits = new string((legacyNumber ?? string.Empty).Where(char.IsDigit).ToArray());
            if (!string.IsNullOrWhiteSpace(legacyDigits))
            {
                normalized.Add(legacyDigits);
            }
        }

        return normalized.Distinct().OrderBy(item => item).ToList();
    }
}
