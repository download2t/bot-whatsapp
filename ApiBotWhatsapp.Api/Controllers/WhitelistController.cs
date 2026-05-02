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
    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    private async Task<bool> IsUserGestorOfCompanyAsync(int companyId, CancellationToken cancellationToken)
    {
        // Admins têm acesso completo
        var adminClaim = User.FindFirst("is_admin")?.Value;
        if (string.Equals(adminClaim, "true", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Não admins: verificar se é Gestor
        var userIdClaim = User.FindFirst("sub")?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
        {
            return false;
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null || user.Title != "Gestor")
        {
            return false;
        }

        // Verificar se está vinculado à empresa
        var isLinked = await dbContext.UserCompanies.AnyAsync(
            uc => uc.UserId == userId && uc.CompanyId == companyId,
            cancellationToken);

        return isLinked;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<WhitelistResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var numbers = await dbContext.WhitelistNumbers
            .Where(item => item.CompanyId == companyId.Value)
            .OrderByDescending(item => item.CreatedAtUtc)
            .Select(item => new WhitelistResponse(item.Id, item.Name, item.PhoneNumber, item.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(numbers);
    }

    [HttpPost]
    public async Task<ActionResult<WhitelistResponse>> Add([FromBody] WhitelistRequest request, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can add to whitelist
        var isGestor = await IsUserGestorOfCompanyAsync(companyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can modify whitelist.");
        }

        var normalized = NormalizePhone(request.PhoneNumber);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return BadRequest("Phone number is required.");
        }

        var name = request.Name?.Trim();

        var exists = await dbContext.WhitelistNumbers.AnyAsync(item => item.CompanyId == companyId.Value && item.PhoneNumber == normalized, cancellationToken);
        if (exists)
        {
            return Conflict("Number is already in whitelist.");
        }

        var entity = new WhitelistNumber
        {
            CompanyId = companyId.Value,
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
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can delete from whitelist
        var isGestor = await IsUserGestorOfCompanyAsync(companyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can modify whitelist.");
        }

        var entity = await dbContext.WhitelistNumbers.FirstOrDefaultAsync(item => item.Id == id && item.CompanyId == companyId.Value, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        dbContext.WhitelistNumbers.Remove(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<WhitelistResponse>> Update(int id, [FromBody] WhitelistRequest request, CancellationToken cancellationToken)
    {
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can update whitelist
        var isGestor = await IsUserGestorOfCompanyAsync(companyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can modify whitelist.");
        }

        var entity = await dbContext.WhitelistNumbers
            .FirstOrDefaultAsync(item => item.Id == id && item.CompanyId == companyId.Value, cancellationToken);
        if (entity is null)
        {
            return NotFound();
        }

        var normalized = NormalizePhone(request.PhoneNumber);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return BadRequest("Phone number is required.");
        }

        var duplicated = await dbContext.WhitelistNumbers.AnyAsync(
            item => item.CompanyId == companyId.Value && item.PhoneNumber == normalized && item.Id != id,
            cancellationToken);
        if (duplicated)
        {
            return Conflict("Number is already in whitelist.");
        }

        var name = request.Name?.Trim();
        entity.Name = string.IsNullOrWhiteSpace(name) ? null : name;
        entity.PhoneNumber = normalized;

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new WhitelistResponse(entity.Id, entity.Name, entity.PhoneNumber, entity.CreatedAtUtc));
    }

    private static string NormalizePhone(string value)
    {
        var digits = value.Where(char.IsDigit).ToArray();
        return new string(digits);
    }
}
