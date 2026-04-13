using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/schedule-rules")]
public class ScheduleRulesController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<ScheduleRuleResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var rules = await dbContext.ScheduleRules
            .OrderBy(rule => rule.StartTime)
            .Select(rule => ToResponse(rule))
            .ToListAsync(cancellationToken);

        return Ok(rules);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ScheduleRuleResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return rule is null ? NotFound() : Ok(ToResponse(rule));
    }

    [HttpPost]
    public async Task<ActionResult<ScheduleRuleResponse>> Create([FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        if (!TryParseTime(request.StartTime, out var startTime) || !TryParseTime(request.EndTime, out var endTime))
        {
            return BadRequest("StartTime and EndTime must be in HH:mm format.");
        }

        var rule = new ScheduleRule
        {
            Name = request.Name.Trim(),
            StartTime = startTime,
            EndTime = endTime,
            Message = request.Message.Trim(),
            IsEnabled = request.IsEnabled,
            ThrottleMinutes = request.ThrottleMinutes,
            IsOutOfBusinessHours = request.IsOutOfBusinessHours,
            MaxDailyMessagesPerUser = request.MaxDailyMessagesPerUser,
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.ScheduleRules.Add(rule);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = rule.Id }, ToResponse(rule));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ScheduleRuleResponse>> Update(int id, [FromBody] ScheduleRuleRequest request, CancellationToken cancellationToken)
    {
        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        if (!TryParseTime(request.StartTime, out var startTime) || !TryParseTime(request.EndTime, out var endTime))
        {
            return BadRequest("StartTime and EndTime must be in HH:mm format.");
        }

        rule.Name = request.Name.Trim();
        rule.StartTime = startTime;
        rule.EndTime = endTime;
        rule.Message = request.Message.Trim();
        rule.IsEnabled = request.IsEnabled;
        rule.ThrottleMinutes = request.ThrottleMinutes;
        rule.IsOutOfBusinessHours = request.IsOutOfBusinessHours;
        rule.MaxDailyMessagesPerUser = request.MaxDailyMessagesPerUser;

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(rule));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var rule = await dbContext.ScheduleRules.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        dbContext.ScheduleRules.Remove(rule);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static bool TryParseTime(string input, out TimeSpan value)
    {
        return TimeSpan.TryParseExact(input, "hh\\:mm", null, out value);
    }

    private static ScheduleRuleResponse ToResponse(ScheduleRule rule)
    {
        return new ScheduleRuleResponse(
            rule.Id,
            rule.Name,
            rule.StartTime.ToString(@"hh\:mm"),
            rule.EndTime.ToString(@"hh\:mm"),
            rule.Message,
            rule.IsEnabled,
            rule.ThrottleMinutes,
            rule.IsOutOfBusinessHours,
            rule.MaxDailyMessagesPerUser,
            rule.CreatedAtUtc);
    }
}
