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
            var text = message.Text?.Trim();
            if (string.IsNullOrWhiteSpace(text))
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

            normalized.Add(new ScheduleRuleMessageRequest(text, days));
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

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ScheduleRuleResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var rules = await dbContext.ScheduleRules
            .Where(rule => rule.OwnerUserId == ownerUserId)
            .OrderBy(rule => rule.StartTime)
            .ToListAsync(cancellationToken);

        var responses = BuildResponses(rules);

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

        return Ok(BuildResponses([rule])[0]);
    }

    [HttpPost]
    public async Task<ActionResult<ScheduleRuleResponse>> Create([FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        if (!TryNormalizeWindows(request.Windows, request.StartTime, request.EndTime, out var normalizedWindows, out var windowError))
        {
            return BadRequest(windowError);
        }

        if (!TryNormalizeMessages(request.Messages, out var normalizedMessages, out var messageError))
        {
            return BadRequest(messageError);
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
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.ScheduleRules.Add(rule);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = rule.Id }, BuildResponses([rule])[0]);
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

        if (!TryNormalizeMessages(request.Messages, out var normalizedMessages, out var messageError))
        {
            return BadRequest(messageError);
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

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(BuildResponses([rule])[0]);
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

    private static List<ScheduleRuleResponse> BuildResponses(List<ScheduleRule> rules)
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
                .Select(message => new ScheduleRuleMessageResponse(
                    message.Text,
                    message.Days,
                    message.Days.Select(GetDayName).ToList()))
                .ToList();

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
                windows));
        }

        return responses;
    }
}
