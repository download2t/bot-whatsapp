using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;
using System.Text.Json;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/schedule-rules")]
public class ScheduleRulesController(AppDbContext dbContext) : ControllerBase
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

    private static bool TryNormalizeMessages(
        IReadOnlyList<ScheduleRuleMessageRequest>? messages,
        IReadOnlySet<int> validPaisIds,
        IReadOnlySet<int> validChatFlowIds,
        out List<ScheduleRuleMessageRequest> normalized,
        out string? error)
    {
        normalized = [];
        error = null;

        if (messages is not { Count: > 0 })
        {
            error = "At least one message is required.";
            return false;
        }

        foreach (var message in messages)
        {
            var text = message.Text?.Trim() ?? string.Empty;

            // A message pointing at a chat flow doesn't send Text at all (the flow's own start
            // step message is what actually goes out) — Text is only required in plain-text mode.
            if (message.ChatFlowId is null && string.IsNullOrWhiteSpace(text))
            {
                error = "Every message must have a non-empty text.";
                return false;
            }

            var days = (message.Days ?? [])
                .Where(day => day is >= 0 and <= 6)
                .Distinct()
                .OrderBy(day => day)
                .ToList();

            if (days.Count == 0)
            {
                error = "Every message must be linked to at least one day of the week.";
                return false;
            }

            if (message.PaisId is not null && !validPaisIds.Contains(message.PaisId.Value))
            {
                error = $"Invalid PaisId: {message.PaisId}.";
                return false;
            }

            if (message.ChatFlowId is not null && !validChatFlowIds.Contains(message.ChatFlowId.Value))
            {
                error = $"Invalid ChatFlowId: {message.ChatFlowId}.";
                return false;
            }

            normalized.Add(new ScheduleRuleMessageRequest(text, days, message.PaisId, message.ChatFlowId));
        }

        return true;
    }

    private static string SerializeMessages(IEnumerable<ScheduleRuleMessageRequest> messages)
    {
        return JsonSerializer.Serialize(messages, WindowsJsonOptions);
    }

    private static List<ScheduleRuleMessageRequest> GetRuleMessages(ScheduleRule rule)
    {
        if (string.IsNullOrWhiteSpace(rule.MessagesJson))
        {
            return [];
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<List<ScheduleRuleMessageRequest>>(rule.MessagesJson, WindowsJsonOptions);
            return parsed ?? [];
        }
        catch
        {
            return [];
        }
    }

    private async Task<Dictionary<int, Pais>> GetOwnerPaisesAsync(int ownerUserId, CancellationToken cancellationToken)
    {
        return await dbContext.Paises
            .Where(p => p.OwnerUserId == ownerUserId)
            .ToDictionaryAsync(p => p.Id, cancellationToken);
    }

    private async Task<Dictionary<int, Turma>> GetOwnerTurmasAsync(int ownerUserId, CancellationToken cancellationToken)
    {
        return await dbContext.Turmas
            .Where(t => t.OwnerUserId == ownerUserId)
            .ToDictionaryAsync(t => t.Id, cancellationToken);
    }

    private async Task<Dictionary<int, ChatFlow>> GetOwnerChatFlowsAsync(int ownerUserId, CancellationToken cancellationToken)
    {
        return await dbContext.ChatFlows
            .Where(f => f.OwnerUserId == ownerUserId)
            .ToDictionaryAsync(f => f.Id, cancellationToken);
    }

    private static readonly HashSet<string> ValidAudienceModes =
        ["RegisteredContacts", "Anyone", "AnyoneExceptRegistered", "AnyoneExceptTurma"];

    private static bool TryNormalizeAudience(
        string? audienceMode,
        int? excludedTurmaId,
        IReadOnlySet<int> validTurmaIds,
        out string normalizedAudienceMode,
        out int? normalizedExcludedTurmaId,
        out string? error)
    {
        normalizedAudienceMode = string.IsNullOrWhiteSpace(audienceMode) ? "RegisteredContacts" : audienceMode.Trim();
        normalizedExcludedTurmaId = null;
        error = null;

        if (!ValidAudienceModes.Contains(normalizedAudienceMode))
        {
            error = $"Invalid AudienceMode: {audienceMode}.";
            return false;
        }

        if (normalizedAudienceMode == "AnyoneExceptTurma")
        {
            if (excludedTurmaId is null || !validTurmaIds.Contains(excludedTurmaId.Value))
            {
                error = "ExcludedTurmaId is required and must belong to the owner when AudienceMode is AnyoneExceptTurma.";
                return false;
            }

            normalizedExcludedTurmaId = excludedTurmaId;
        }

        return true;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ScheduleRuleResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var rules = await dbContext.ScheduleRules
            .Where(rule => rule.OwnerUserId == ownerUserId)
            .OrderBy(rule => rule.StartTime)
            .ToListAsync(cancellationToken);

        var paisById = await GetOwnerPaisesAsync(ownerUserId, cancellationToken);
        var turmaById = await GetOwnerTurmasAsync(ownerUserId, cancellationToken);
        var chatFlowById = await GetOwnerChatFlowsAsync(ownerUserId, cancellationToken);
        var responses = BuildResponses(rules, paisById, turmaById, chatFlowById);

        return Ok(responses);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ScheduleRuleResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id && item.OwnerUserId == ownerUserId, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        var paisById = await GetOwnerPaisesAsync(ownerUserId, cancellationToken);
        var turmaById = await GetOwnerTurmasAsync(ownerUserId, cancellationToken);
        var chatFlowById = await GetOwnerChatFlowsAsync(ownerUserId, cancellationToken);
        return Ok(BuildResponses([rule], paisById, turmaById, chatFlowById)[0]);
    }

    [HttpPost]
    public async Task<ActionResult<ScheduleRuleResponse>> Create([FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        if (!TryNormalizeWindows(request.Windows, request.StartTime, request.EndTime, out var normalizedWindows, out var windowError))
        {
            return BadRequest(windowError);
        }

        var paisById = await GetOwnerPaisesAsync(ownerUserId, cancellationToken);
        var chatFlowById = await GetOwnerChatFlowsAsync(ownerUserId, cancellationToken);
        if (!TryNormalizeMessages(request.Messages, paisById.Keys.ToHashSet(), chatFlowById.Keys.ToHashSet(), out var normalizedMessages, out var messageError))
        {
            return BadRequest(messageError);
        }

        var turmaById = await GetOwnerTurmasAsync(ownerUserId, cancellationToken);
        if (!TryNormalizeAudience(request.AudienceMode, request.ExcludedTurmaId, turmaById.Keys.ToHashSet(), out var normalizedAudienceMode, out var normalizedExcludedTurmaId, out var audienceError))
        {
            return BadRequest(audienceError);
        }

        var rule = new ScheduleRule
        {
            OwnerUserId = ownerUserId,
            Name = request.Name.Trim(),
            StartTime = TimeSpan.ParseExact(normalizedWindows[0].StartTime, @"hh\:mm", CultureInfo.InvariantCulture),
            EndTime = TimeSpan.ParseExact(normalizedWindows[0].EndTime, @"hh\:mm", CultureInfo.InvariantCulture),
            ScheduleWindowsJson = SerializeWindows(normalizedWindows),
            MessagesJson = SerializeMessages(normalizedMessages),
            IsEnabled = request.IsEnabled,
            ThrottleMinutes = request.ThrottleMinutes,
            IsOutOfBusinessHours = request.IsOutOfBusinessHours,
            MaxDailyMessagesPerUser = request.MaxDailyMessagesPerUser,
            AudienceMode = normalizedAudienceMode,
            ExcludedTurmaId = normalizedExcludedTurmaId,
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.ScheduleRules.Add(rule);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = rule.Id }, BuildResponses([rule], paisById, turmaById, chatFlowById)[0]);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ScheduleRuleResponse>> Update(int id, [FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id && item.OwnerUserId == ownerUserId, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        if (!TryNormalizeWindows(request.Windows, request.StartTime, request.EndTime, out var normalizedWindows, out var windowError))
        {
            return BadRequest(windowError);
        }

        var paisById = await GetOwnerPaisesAsync(ownerUserId, cancellationToken);
        var chatFlowById = await GetOwnerChatFlowsAsync(ownerUserId, cancellationToken);
        if (!TryNormalizeMessages(request.Messages, paisById.Keys.ToHashSet(), chatFlowById.Keys.ToHashSet(), out var normalizedMessages, out var messageError))
        {
            return BadRequest(messageError);
        }

        var turmaById = await GetOwnerTurmasAsync(ownerUserId, cancellationToken);
        if (!TryNormalizeAudience(request.AudienceMode, request.ExcludedTurmaId, turmaById.Keys.ToHashSet(), out var normalizedAudienceMode, out var normalizedExcludedTurmaId, out var audienceError))
        {
            return BadRequest(audienceError);
        }

        rule.Name = request.Name.Trim();
        rule.StartTime = TimeSpan.ParseExact(normalizedWindows[0].StartTime, @"hh\:mm", CultureInfo.InvariantCulture);
        rule.EndTime = TimeSpan.ParseExact(normalizedWindows[0].EndTime, @"hh\:mm", CultureInfo.InvariantCulture);
        rule.ScheduleWindowsJson = SerializeWindows(normalizedWindows);
        rule.MessagesJson = SerializeMessages(normalizedMessages);
        rule.IsEnabled = request.IsEnabled;
        rule.ThrottleMinutes = request.ThrottleMinutes;
        rule.IsOutOfBusinessHours = request.IsOutOfBusinessHours;
        rule.MaxDailyMessagesPerUser = request.MaxDailyMessagesPerUser;
        rule.AudienceMode = normalizedAudienceMode;
        rule.ExcludedTurmaId = normalizedExcludedTurmaId;

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(BuildResponses([rule], paisById, turmaById, chatFlowById)[0]);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id && item.OwnerUserId == ownerUserId, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        dbContext.ScheduleRules.Remove(rule);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static List<ScheduleRuleResponse> BuildResponses(List<ScheduleRule> rules, Dictionary<int, Pais> paisById, Dictionary<int, Turma> turmaById, Dictionary<int, ChatFlow> chatFlowById)
    {
        var responses = new List<ScheduleRuleResponse>(rules.Count);
        foreach (var rule in rules)
        {
            var windows = GetRuleWindows(rule)
                .Select(window => new ScheduleRuleTimeWindowResponse(
                    window.DayOfWeek,
                    GetDayName(window.DayOfWeek),
                    window.StartTime,
                    window.EndTime))
                .ToList();

            var messages = GetRuleMessages(rule)
                .Select(message =>
                {
                    var pais = message.PaisId is not null && paisById.TryGetValue(message.PaisId.Value, out var foundPais) ? foundPais : null;
                    var chatFlow = message.ChatFlowId is not null && chatFlowById.TryGetValue(message.ChatFlowId.Value, out var foundFlow) ? foundFlow : null;
                    return new ScheduleRuleMessageResponse(
                        message.Text,
                        message.Days,
                        message.Days.Select(GetDayName).ToList(),
                        message.PaisId,
                        pais?.Name,
                        pais?.Ddi,
                        message.ChatFlowId,
                        chatFlow?.Name);
                })
                .ToList();

            var excludedTurmaName = rule.ExcludedTurmaId is not null && turmaById.TryGetValue(rule.ExcludedTurmaId.Value, out var foundTurma)
                ? foundTurma.Name
                : null;

            responses.Add(new ScheduleRuleResponse(
                rule.Id,
                rule.Name,
                windows.FirstOrDefault()?.StartTime ?? rule.StartTime.ToString(@"hh\:mm"),
                windows.FirstOrDefault()?.EndTime ?? rule.EndTime.ToString(@"hh\:mm"),
                messages,
                rule.IsEnabled,
                rule.ThrottleMinutes,
                rule.IsOutOfBusinessHours,
                rule.MaxDailyMessagesPerUser,
                rule.CreatedAtUtc,
                windows,
                rule.AudienceMode,
                rule.ExcludedTurmaId,
                excludedTurmaName));
        }

        return responses;
    }
}
