using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/turmas")]
public class TurmasController(AppDbContext dbContext) : ControllerBase
{
    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TurmaResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var items = await dbContext.Turmas
            .Where(t => t.CompanyId == companyId.Value)
            .OrderBy(t => t.Name)
            .Select(t => new TurmaResponse(t.Id, t.Name, t.IsActive))
            .ToListAsync(cancellationToken);

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<TurmaResponse>> Create([FromBody] TurmaRequest req, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Name is required.");

        var entity = new Turma { CompanyId = companyId.Value, Name = name, IsActive = req.IsActive };
        dbContext.Turmas.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetAll), new { id = entity.Id }, new TurmaResponse(entity.Id, entity.Name, entity.IsActive));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TurmaResponse>> Update(int id, [FromBody] TurmaRequest req, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var entity = await dbContext.Turmas.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId.Value, cancellationToken);
        if (entity is null) return NotFound();

        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return BadRequest("Name is required.");

        entity.Name = name;
        
        // If deactivating turma, deactivate all linked contacts
        if (!req.IsActive && entity.IsActive)
        {
            var contacts = await dbContext.Contatos.Where(c => c.TurmaId == id && c.CompanyId == companyId.Value).ToListAsync(cancellationToken);
            foreach (var c in contacts) c.IsActive = false;
        }
        
        entity.IsActive = req.IsActive;
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new TurmaResponse(entity.Id, entity.Name, entity.IsActive));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        var entity = await dbContext.Turmas.FirstOrDefaultAsync(t => t.Id == id && t.CompanyId == companyId.Value, cancellationToken);
        if (entity is null) return NotFound();

        // Optionally: ensure no contacts are linked? For now allow delete and nullify on contacts
        var contacts = await dbContext.Contatos.Where(c => c.TurmaId == id && c.CompanyId == companyId.Value).ToListAsync(cancellationToken);
        foreach (var c in contacts) c.TurmaId = null;

        dbContext.Turmas.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
