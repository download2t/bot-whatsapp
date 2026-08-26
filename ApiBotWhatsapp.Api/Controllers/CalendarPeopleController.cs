using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

// Shared address book for the Calendário module (see CalendarPerson) — not scoped by
// OwnerUserId. Every action is gated on User.IsCalendarUser instead.
[ApiController]
[Route("api/calendar/people")]
public class CalendarPeopleController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<CalendarPersonResponse>>> GetAll([FromQuery] string? name, CancellationToken cancellationToken)
    {
        if (!this.IsCalendarUser())
        {
            return Forbid();
        }

        var query = dbContext.CalendarPeople.AsQueryable();
        if (!string.IsNullOrWhiteSpace(name))
        {
            var term = name.Trim();
            query = query.Where(p => p.Name.Contains(term));
        }

        var people = await query
            .OrderBy(p => p.Name)
            .ToListAsync(cancellationToken);

        return Ok(people.Select(ToResponse));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CalendarPersonResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        if (!this.IsCalendarUser())
        {
            return Forbid();
        }

        var person = await dbContext.CalendarPeople.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (person is null)
        {
            return NotFound();
        }

        return Ok(ToResponse(person));
    }

    [HttpPost]
    public async Task<ActionResult<CalendarPersonResponse>> Create([FromBody] CalendarPersonRequest request, CancellationToken cancellationToken)
    {
        if (!this.IsCalendarUser())
        {
            return Forbid();
        }

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return BadRequest("Name is required.");
        }

        var entity = new CalendarPerson
        {
            Name = name,
            BirthDate = request.BirthDate,
            PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : PhoneNumberUtils.Normalize(request.PhoneNumber),
            Email = request.Email?.Trim(),
            Notes = request.Notes?.Trim(),
            IsActive = request.IsActive,
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.CalendarPeople.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, ToResponse(entity));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CalendarPersonResponse>> Update(int id, [FromBody] CalendarPersonRequest request, CancellationToken cancellationToken)
    {
        if (!this.IsCalendarUser())
        {
            return Forbid();
        }

        var entity = await dbContext.CalendarPeople.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return BadRequest("Name is required.");
        }

        entity.Name = name;
        entity.BirthDate = request.BirthDate;
        entity.PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : PhoneNumberUtils.Normalize(request.PhoneNumber);
        entity.Email = request.Email?.Trim();
        entity.Notes = request.Notes?.Trim();
        entity.IsActive = request.IsActive;
        entity.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(entity));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        if (!this.IsCalendarUser())
        {
            return Forbid();
        }

        var entity = await dbContext.CalendarPeople.FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        dbContext.CalendarPeople.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static CalendarPersonResponse ToResponse(CalendarPerson person) => new(
        person.Id,
        person.Name,
        person.BirthDate,
        CalculateAge(person.BirthDate),
        person.PhoneNumber,
        person.Email,
        person.Notes,
        person.IsActive);

    private static int? CalculateAge(DateOnly? birthDate)
    {
        if (birthDate is null)
        {
            return null;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var age = today.Year - birthDate.Value.Year;
        if (birthDate.Value > today.AddYears(-age))
        {
            age--;
        }

        return age;
    }
}
