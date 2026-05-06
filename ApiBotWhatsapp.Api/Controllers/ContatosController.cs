using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Xml.Linq;

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

    [HttpPost("import-xml")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult> ImportXml([FromForm] IFormFile file, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null) return Unauthorized();

        if (file is null || file.Length == 0)
        {
            return BadRequest("XML file is required.");
        }

        XDocument document;
        try
        {
            await using var stream = file.OpenReadStream();
            document = XDocument.Load(stream);
        }
        catch
        {
            return BadRequest("Invalid XML file.");
        }

        var importedContacts = ExtractContacts(document)
            .Select(contact => new
            {
                Name = contact.Name.Trim(),
                PhoneNumber = PhoneNumberUtils.Normalize(contact.PhoneNumber)
            })
            .Where(contact => !string.IsNullOrWhiteSpace(contact.Name) && !string.IsNullOrWhiteSpace(contact.PhoneNumber))
            .ToList();

        if (!importedContacts.Any())
        {
            return BadRequest("No valid contacts found in XML.");
        }

        var turmaName = ExtractTurmaName(document)
            ?? $"Turma Importada {DateTime.UtcNow:yyyyMMdd-HHmmss}";

        var turma = new Turma
        {
            CompanyId = companyId.Value,
            Name = turmaName.Trim(),
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        dbContext.Turmas.Add(turma);
        await dbContext.SaveChangesAsync(cancellationToken);

        var contacts = importedContacts.Select(contact => new Contato
        {
            CompanyId = companyId.Value,
            Name = contact.Name,
            PhoneNumber = contact.PhoneNumber,
            TurmaId = turma.Id,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        }).ToList();

        dbContext.Contatos.AddRange(contacts);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            turmaId = turma.Id,
            turmaName = turma.Name,
            importedContacts = contacts.Count
        });
    }

    private static string? ExtractTurmaName(XDocument document)
    {
        var root = document.Root;
        if (root is null)
        {
            return null;
        }

        var directName = GetElementOrAttributeValue(root, "nome", "name", "turmaNome", "turmaName");
        if (!string.IsNullOrWhiteSpace(directName))
        {
            return directName.Trim();
        }

        var turmaElement = root.Descendants().FirstOrDefault(element => element.Name.LocalName.Equals("turma", StringComparison.OrdinalIgnoreCase));
        if (turmaElement is not null)
        {
            var turmaName = GetElementOrAttributeValue(turmaElement, "nome", "name", "turmaNome", "turmaName");
            if (!string.IsNullOrWhiteSpace(turmaName))
            {
                return turmaName.Trim();
            }
        }

        return null;
    }

    private static IEnumerable<(string Name, string PhoneNumber)> ExtractContacts(XDocument document)
    {
        var root = document.Root;
        if (root is null)
        {
            yield break;
        }

        var contactElements = root.Descendants()
            .Where(element => element.Name.LocalName.Equals("contato", StringComparison.OrdinalIgnoreCase) ||
                              element.Name.LocalName.Equals("contact", StringComparison.OrdinalIgnoreCase));

        foreach (var element in contactElements)
        {
            var name = GetElementOrAttributeValue(element, "nome", "name", "fullName");
            var phoneNumber = GetElementOrAttributeValue(element, "numero", "number", "telefone", "phone", "phoneNumber", "phone_number");

            if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(phoneNumber))
            {
                yield return (name.Trim(), phoneNumber.Trim());
            }
        }
    }

    private static string? GetElementOrAttributeValue(XElement element, params string[] names)
    {
        foreach (var name in names)
        {
            var attribute = element.Attributes().FirstOrDefault(item => item.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase))?.Value;
            if (!string.IsNullOrWhiteSpace(attribute))
            {
                return attribute;
            }

            var child = element.Elements().FirstOrDefault(item => item.Name.LocalName.Equals(name, StringComparison.OrdinalIgnoreCase))?.Value;
            if (!string.IsNullOrWhiteSpace(child))
            {
                return child;
            }
        }

        return null;
    }
}
