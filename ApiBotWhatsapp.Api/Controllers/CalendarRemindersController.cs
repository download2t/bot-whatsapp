using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

// Shared reminders for the Calendário module (see CalendarReminder) — not scoped by
// OwnerUserId. Open to any authenticated user, same as CalendarPeopleController. Birthdays
// aren't stored here; the frontend derives them live from CalendarPeopleController for
// whatever month/range is being viewed.
[ApiController]
[Route("api/calendar/reminders")]
public class CalendarRemindersController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<CalendarReminderResponse>>> GetAll([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken)
    {
        var query = dbContext.CalendarReminders.Include(r => r.CalendarPerson).AsQueryable();
        if (from is not null)
        {
            query = query.Where(r => r.Date >= from.Value);
        }

        if (to is not null)
        {
            query = query.Where(r => r.Date <= to.Value);
        }

        // ThenBy(r.Time) is deliberately not part of the EF query: SQLite can't ORDER BY a
        // TimeSpan column server-side, so the secondary sort happens client-side after
        // materializing (the result set here is small — a date-range slice for one month view).
        var reminders = await query
            .OrderBy(r => r.Date)
            .ToListAsync(cancellationToken);

        return Ok(reminders.OrderBy(r => r.Date).ThenBy(r => r.Time).Select(ToResponse));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CalendarReminderResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var reminder = await dbContext.CalendarReminders.Include(r => r.CalendarPerson)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (reminder is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(reminder));
    }

    [HttpPost]
    public async Task<ActionResult<CalendarReminderResponse>> Create([FromBody] CalendarReminderRequest request, CancellationToken cancellationToken)
    {
        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return BadRequest("Title is required.");
        }

        var personId = await ResolvePersonIdAsync(request.CalendarPersonId, cancellationToken);

        var entity = new CalendarReminder
        {
            Title = title,
            Description = request.Description?.Trim(),
            Date = request.Date,
            Time = request.Time,
            IsRecurringYearly = request.IsRecurringYearly,
            CalendarPersonId = personId,
            CreatedByUserId = this.GetCurrentUserId(),
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.CalendarReminders.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        var saved = await dbContext.CalendarReminders.Include(r => r.CalendarPerson)
            .FirstAsync(r => r.Id == entity.Id, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToResponse(saved));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CalendarReminderResponse>> Update(int id, [FromBody] CalendarReminderRequest request, CancellationToken cancellationToken)
    {
        var entity = await dbContext.CalendarReminders.Include(r => r.CalendarPerson)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        var title = request.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return BadRequest("Title is required.");
        }

        entity.Title = title;
        entity.Description = request.Description?.Trim();
        entity.Date = request.Date;
        entity.Time = request.Time;
        entity.IsRecurringYearly = request.IsRecurringYearly;
        entity.CalendarPersonId = await ResolvePersonIdAsync(request.CalendarPersonId, cancellationToken);
        entity.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        var saved = await dbContext.CalendarReminders.Include(r => r.CalendarPerson)
            .FirstAsync(r => r.Id == entity.Id, cancellationToken);
        return Ok(ToResponse(saved));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var entity = await dbContext.CalendarReminders.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        dbContext.CalendarReminders.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task<int?> ResolvePersonIdAsync(int? requestedPersonId, CancellationToken cancellationToken)
    {
        if (requestedPersonId is null)
        {
            return null;
        }

        var exists = await dbContext.CalendarPeople.AnyAsync(p => p.Id == requestedPersonId.Value, cancellationToken);
        return exists ? requestedPersonId : null;
    }

    private static CalendarReminderResponse ToResponse(CalendarReminder reminder) => new(
        reminder.Id,
        reminder.Title,
        reminder.Description,
        reminder.Date,
        reminder.Time,
        reminder.IsRecurringYearly,
        reminder.CalendarPersonId,
        reminder.CalendarPerson?.Name);
}
