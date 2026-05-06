using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/contatos")]
public class ContatosController(AppDbContext dbContext) : ControllerBase
{
    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ContatoResponse>>> GetAll([FromQuery] int? turmaId, [FromQuery] string? name, [FromQuery] string? phone, CancellationToken cancellationToken = default)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var q = dbContext.Contatos.AsQueryable().Where(c => c.CompanyId == companyId.Value);

        if (turmaId is not null)
            q = q.Where(c => c.TurmaId == turmaId.Value);

        if (!string.IsNullOrWhiteSpace(name))
        {
            var tn = name.Trim();
            q = q.Where(c => c.Name.Contains(tn));
        }

        if (!string.IsNullOrWhiteSpace(phone))
        {
            var pn = PhoneNumberUtils.Normalize(phone);
            q = q.Where(c => c.PhoneNumber.Contains(pn));
        }

        var results = await q.OrderBy(c => c.Name)
            .Select(c => new ContatoResponse(c.Id, c.Name, c.PhoneNumber, c.TurmaId, c.IsActive))
            .ToListAsync(cancellationToken);

        return Ok(results);
    }

    [HttpPost]
    public async Task<ActionResult<ContatoResponse>> Create([FromBody] ContatoRequest req, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var name = req.Name?.Trim();
        var normalized = PhoneNumberUtils.Normalize(req.PhoneNumber);
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(normalized)) return BadRequest("Name and phone number are required.");

        var entity = new Contato { CompanyId = companyId.Value, Name = name!, PhoneNumber = normalized, TurmaId = req.TurmaId, IsActive = req.IsActive };
        dbContext.Contatos.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetAll), new { id = entity.Id }, new ContatoResponse(entity.Id, entity.Name, entity.PhoneNumber, entity.TurmaId, entity.IsActive));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ContatoResponse>> Update(int id, [FromBody] ContatoRequest req, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var entity = await dbContext.Contatos.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId.Value, cancellationToken);
        if (entity is null) return NotFound();

        var name = req.Name?.Trim();
        var normalized = PhoneNumberUtils.Normalize(req.PhoneNumber);
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(normalized)) return BadRequest("Name and phone number are required.");

        entity.Name = name!;
        entity.PhoneNumber = normalized;
        entity.TurmaId = req.TurmaId;
        entity.IsActive = req.IsActive;

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new ContatoResponse(entity.Id, entity.Name, entity.PhoneNumber, entity.TurmaId, entity.IsActive));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var entity = await dbContext.Contatos.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId.Value, cancellationToken);
        if (entity is null) return NotFound();

        dbContext.Contatos.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
