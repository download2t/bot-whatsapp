using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/companies")]
public class CompaniesController(AppDbContext dbContext) : ControllerBase
{
    private bool IsCurrentUserAdmin()
    {
        var claim = User.FindFirst("is_admin")?.Value;
        return string.Equals(claim, "true", StringComparison.OrdinalIgnoreCase);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CompanyListResponse>>> GetAll([FromQuery] string? name, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var query = dbContext.Companies.AsQueryable();
        var normalizedName = (name ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(normalizedName))
        {
            query = query.Where(item => item.Name.Contains(normalizedName));
        }

        var companies = await query
            .OrderBy(item => item.Name)
            .Select(item => new CompanyListResponse(
                item.Id,
                item.Name,
                item.UniqueCode,
                item.CreatedAtUtc,
                dbContext.UserCompanies.Count(mapping => mapping.CompanyId == item.Id)))
            .ToListAsync(cancellationToken);

        return Ok(companies);
    }

    [HttpPost]
    public async Task<ActionResult<CompanyListResponse>> Create([FromBody] CompanyCreateRequest request, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var name = (request.Name ?? string.Empty).Trim();
        var code = NormalizeCode(request.CompanyCode);
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(code))
        {
            return BadRequest("Name and CompanyCode are required.");
        }

        var codeExists = await dbContext.Companies.AnyAsync(item => item.UniqueCode == code, cancellationToken);
        if (codeExists)
        {
            return Conflict("Company code already exists.");
        }

        var company = new Company
        {
            Name = name,
            UniqueCode = code,
            CreatedAtUtc = DateTime.UtcNow,
        };

        dbContext.Companies.Add(company);
        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new CompanyListResponse(company.Id, company.Name, company.UniqueCode, company.CreatedAtUtc, 0));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CompanyListResponse>> Update(int id, [FromBody] CompanyUpdateRequest request, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var company = await dbContext.Companies.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (company is null)
        {
            return NotFound();
        }

        var name = (request.Name ?? string.Empty).Trim();
        var code = NormalizeCode(request.CompanyCode);
        if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(code))
        {
            return BadRequest("Name and CompanyCode are required.");
        }

        var codeExists = await dbContext.Companies.AnyAsync(item => item.Id != id && item.UniqueCode == code, cancellationToken);
        if (codeExists)
        {
            return Conflict("Company code already exists.");
        }

        company.Name = name;
        company.UniqueCode = code;
        await dbContext.SaveChangesAsync(cancellationToken);

        var usersCount = await dbContext.UserCompanies.CountAsync(item => item.CompanyId == company.Id, cancellationToken);
        return Ok(new CompanyListResponse(company.Id, company.Name, company.UniqueCode, company.CreatedAtUtc, usersCount));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var company = await dbContext.Companies.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (company is null)
        {
            return NotFound();
        }

        var hasBusinessData = await dbContext.ScheduleRules.AnyAsync(item => item.CompanyId == id, cancellationToken)
            || await dbContext.MessageLogs.AnyAsync(item => item.CompanyId == id, cancellationToken)
            || await dbContext.WhitelistNumbers.AnyAsync(item => item.CompanyId == id, cancellationToken);

        if (hasBusinessData)
        {
            return BadRequest("Company has related business data and cannot be deleted.");
        }

        var links = await dbContext.UserCompanies.Where(item => item.CompanyId == id).ToListAsync(cancellationToken);
        if (links.Count > 0)
        {
            dbContext.UserCompanies.RemoveRange(links);
        }

        dbContext.Companies.Remove(company);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:int}/users")]
    public async Task<ActionResult<IEnumerable<CompanyUserResponse>>> GetUsers(int id, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var companyExists = await dbContext.Companies.AnyAsync(item => item.Id == id, cancellationToken);
        if (!companyExists)
        {
            return NotFound();
        }

        var users = await dbContext.UserCompanies
            .Where(item => item.CompanyId == id)
            .Join(
                dbContext.Users,
                link => link.UserId,
                user => user.Id,
                (link, user) => new { user.Id, user.Username, user.IsAdmin, user.Email, user.FullName })
            .ToListAsync(cancellationToken);

        var result = users
            .OrderBy(item => item.Username)
            .Select(item => new CompanyUserResponse(item.Id, item.Username, item.IsAdmin, item.Email, item.FullName))
            .ToList();

        return Ok(result);
    }

    [HttpGet("{id:int}/users/options")]
    public async Task<ActionResult<IEnumerable<CompanyUserOptionResponse>>> GetUserOptions(int id, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var companyExists = await dbContext.Companies.AnyAsync(item => item.Id == id, cancellationToken);
        if (!companyExists)
        {
            return NotFound();
        }

        var users = await dbContext.Users
            .Where(item => !dbContext.UserCompanies.Any(link => link.UserId == item.Id))
            .OrderBy(item => item.Username)
            .Select(item => new CompanyUserOptionResponse(
                item.Id,
                item.Username,
                item.IsAdmin,
                item.Email,
                item.FullName,
                false))
            .ToListAsync(cancellationToken);

        return Ok(users);
    }

    [HttpPost("{id:int}/users")]
    public async Task<ActionResult> LinkUser(int id, [FromBody] LinkUserCompanyRequest request, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var company = await dbContext.Companies.FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (company is null)
        {
            return NotFound("Company not found.");
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(item => item.Id == request.UserId, cancellationToken);
        if (user is null)
        {
            return NotFound("User not found.");
        }

        var exists = await dbContext.UserCompanies.AnyAsync(item => item.CompanyId == id && item.UserId == user.Id, cancellationToken);
        if (exists)
        {
            return NoContent();
        }

        dbContext.UserCompanies.Add(new UserCompany
        {
            UserId = user.Id,
            CompanyId = id,
            AssignedAtUtc = DateTime.UtcNow,
        });

        if (user.CompanyId <= 0)
        {
            user.CompanyId = id;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpDelete("{id:int}/users/{userId:int}")]
    public async Task<ActionResult> UnlinkUser(int id, int userId, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var linkQuery = dbContext.UserCompanies.Where(item => item.CompanyId == id && item.UserId == userId);
        var linkExists = await linkQuery.AnyAsync(cancellationToken);
        if (!linkExists)
        {
            return NotFound();
        }

        await linkQuery.ExecuteDeleteAsync(cancellationToken);

        var user = await dbContext.Users.FirstOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is not null && user.CompanyId == id)
        {
            var nextCompanyId = await dbContext.UserCompanies
                .Where(item => item.UserId == userId && item.CompanyId != id)
                .Select(item => item.CompanyId)
                .FirstOrDefaultAsync(cancellationToken);
            user.CompanyId = nextCompanyId > 0 ? nextCompanyId : 0;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static string NormalizeCode(string raw)
    {
        var upper = (raw ?? string.Empty).Trim().ToUpperInvariant();
        return string.Join('-', upper.Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}