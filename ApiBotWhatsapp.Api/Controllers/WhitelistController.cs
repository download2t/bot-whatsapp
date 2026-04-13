using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/whitelist")]
public class WhitelistController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<WhitelistResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var numbers = await dbContext.WhitelistNumbers
            .OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new WhitelistResponse(item.Id, item.Name, item.PhoneNumber, item.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(numbers);
    }

    [HttpPost]
    public async Task<ActionResult<WhitelistResponse>> Add([FromBody] WhitelistRequest request, CancellationToken cancellationToken)
    {
        var normalized = NormalizePhone(request.PhoneNumber);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return BadRequest("Phone number is required.");
        }

        var name = request.Name?.Trim();

        var exists = await dbContext.WhitelistNumbers.AnyAsync(item => item.PhoneNumber == normalized, cancellationToken);
        if (exists)
        {
            return Conflict("Number is already in whitelist.");
        }

        var entity = new WhitelistNumber
        {
            Name = string.IsNullOrWhiteSpace(name) ? null : name,
            PhoneNumber = normalized,
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.WhitelistNumbers.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        var response = new WhitelistResponse(entity.Id, entity.Name, entity.PhoneNumber, entity.CreatedAtUtc);
        return CreatedAtAction(nameof(GetAll), new { id = entity.Id }, response);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var entity = await dbContext.WhitelistNumbers.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        dbContext.WhitelistNumbers.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static string NormalizePhone(string value)
    {
        var digits = value.Where(char.IsDigit).ToArray();
        return new string(digits);
    }
}
