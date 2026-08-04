using System.Text.Json;
using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/paises")]
public class PaisesController(AppDbContext dbContext) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static PaisResponse ToResponse(Pais pais) => new(pais.Id, pais.Name, pais.Ddi, pais.IsActive);

    private static bool TryNormalize(PaisRequest req, out string name, out string ddi, out string? error)
    {
        name = req.Name?.Trim() ?? string.Empty;
        ddi = PhoneNumberUtils.Normalize(req.Ddi ?? string.Empty);
        error = null;

        if (string.IsNullOrWhiteSpace(name))
        {
            error = "Name is required.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(ddi) || ddi.Length > 4)
        {
            error = "DDI must contain 1 to 4 digits.";
            return false;
        }

        return true;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PaisResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var items = await dbContext.Paises
            .Where(p => p.OwnerUserId == ownerUserId)
            .OrderBy(p => p.Name)
            .Select(p => new PaisResponse(p.Id, p.Name, p.Ddi, p.IsActive))
            .ToListAsync(cancellationToken);

        return Ok(items);
    }

    [HttpPost]
    public async Task<ActionResult<PaisResponse>> Create([FromBody] PaisRequest req, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        if (!TryNormalize(req, out var name, out var ddi, out var error))
        {
            return BadRequest(error);
        }

        var ddiInUse = await dbContext.Paises
            .AnyAsync(p => p.OwnerUserId == ownerUserId && p.Ddi == ddi, cancellationToken);
        if (ddiInUse)
        {
            return BadRequest($"Já existe um país cadastrado com o DDI {ddi}.");
        }

        var entity = new Pais { OwnerUserId = ownerUserId, Name = name, Ddi = ddi, IsActive = req.IsActive };
        dbContext.Paises.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetAll), new { id = entity.Id }, ToResponse(entity));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<PaisResponse>> Update(int id, [FromBody] PaisRequest req, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();
        var entity = await dbContext.Paises.FirstOrDefaultAsync(p => p.Id == id && p.OwnerUserId == ownerUserId, cancellationToken);
        if (entity is null) return NotFound();

        if (!TryNormalize(req, out var name, out var ddi, out var error))
        {
            return BadRequest(error);
        }

        var ddiInUse = await dbContext.Paises
            .AnyAsync(p => p.OwnerUserId == ownerUserId && p.Ddi == ddi && p.Id != id, cancellationToken);
        if (ddiInUse)
        {
            return BadRequest($"Já existe um país cadastrado com o DDI {ddi}.");
        }

        entity.Name = name;
        entity.Ddi = ddi;
        entity.IsActive = req.IsActive;

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(entity));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();
        var entity = await dbContext.Paises.FirstOrDefaultAsync(p => p.Id == id && p.OwnerUserId == ownerUserId, cancellationToken);
        if (entity is null) return NotFound();

        // MessagesJson is a free-form JSON column (no real FK), so deleting a país that's still
        // referenced there would leave a dangling PaisId on some rule's message — block it
        // instead of silently orphaning that message.
        var rules = await dbContext.ScheduleRules
            .Where(rule => rule.OwnerUserId == ownerUserId)
            .ToListAsync(cancellationToken);

        var inUse = rules.Any(rule =>
        {
            try
            {
                var messages = JsonSerializer.Deserialize<List<ScheduleRuleMessageRequest>>(rule.MessagesJson, JsonOptions);
                return messages?.Any(m => m.PaisId == id) ?? false;
            }
            catch
            {
                return false;
            }
        });

        if (inUse)
        {
            return BadRequest("Não é possível excluir: há mensagens de regras vinculadas a este país. Reatribua ou remova essas mensagens antes de excluir.");
        }

        dbContext.Paises.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
