using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController(AppDbContext dbContext) : ControllerBase
{
    private readonly PasswordHasher<User> _passwordHasher = new();

    private bool IsCurrentUserAdmin()
    {
        return string.Equals(User.FindFirst("is_admin")?.Value, "true", StringComparison.OrdinalIgnoreCase);
    }

    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    private async Task<int?> ResolveCompanyIdAsync(int? requestedCompanyId, CancellationToken cancellationToken)
    {
        if (IsCurrentUserAdmin() && requestedCompanyId.HasValue)
        {
            var exists = await dbContext.Companies.AnyAsync(c => c.Id == requestedCompanyId.Value, cancellationToken);
            return exists ? requestedCompanyId.Value : null;
        }

        return GetCurrentCompanyId();
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
    public async Task<ActionResult<IEnumerable<UserListResponse>>> GetAll([FromQuery] int? companyId, CancellationToken cancellationToken)
    {
        var resolvedCompanyId = await ResolveCompanyIdAsync(companyId, cancellationToken);
        if (resolvedCompanyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var company = await dbContext.Companies.FirstAsync(c => c.Id == resolvedCompanyId.Value, cancellationToken);
        var users = await dbContext.UserCompanies
            .Where(mapping => mapping.CompanyId == resolvedCompanyId.Value)
            .Join(
                dbContext.Users,
                mapping => mapping.UserId,
                user => user.Id,
                (mapping, user) => user)
            .OrderByDescending(user => user.CreatedAtUtc)
            .Select(user => new UserListResponse(user.Id, user.Username, user.IsAdmin, company.Id, company.Name, company.UniqueCode, user.Email, user.Phone, user.FullName, user.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(users);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UserProfileResponse>> GetById(int id, [FromQuery] int? companyId, CancellationToken cancellationToken)
    {
        var resolvedCompanyId = await ResolveCompanyIdAsync(companyId, cancellationToken);
        if (resolvedCompanyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var user = await dbContext.UserCompanies
            .Where(mapping => mapping.CompanyId == resolvedCompanyId.Value && mapping.UserId == id)
            .Join(
                dbContext.Users,
                mapping => mapping.UserId,
                targetUser => targetUser.Id,
                (mapping, targetUser) => targetUser)
            .FirstOrDefaultAsync(cancellationToken);
        if (user is null)
        {
            return NotFound();
        }

        var company = await dbContext.Companies.FirstAsync(c => c.Id == resolvedCompanyId.Value, cancellationToken);

        return Ok(new UserProfileResponse(user.Id, user.Username, user.IsAdmin, company.Id, company.Name, company.UniqueCode, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
    }

    [HttpPost]
    public async Task<ActionResult<UserProfileResponse>> Create([FromQuery] int? companyId, [FromBody] CreateUserRequest request, CancellationToken cancellationToken)
    {
        var resolvedCompanyId = await ResolveCompanyIdAsync(companyId, cancellationToken);
        if (resolvedCompanyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        // Only admins and gestores can create users
        var isGestor = await IsUserGestorOfCompanyAsync(resolvedCompanyId.Value, cancellationToken);
        if (!isGestor)
        {
            return Forbid("Only administrators and gestores can create users.");
        }

        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest("Username and password are required.");
        }

        if (request.Password.Length < 6)
        {
            return BadRequest("Password must contain at least 6 characters.");
        }

        var username = request.Username.Trim();
        var exists = await dbContext.Users.AnyAsync(u => u.Username == username, cancellationToken);
        if (exists)
        {
            return Conflict("Username already exists.");
        }

        var isCurrentUserAdmin = IsCurrentUserAdmin();
        var shouldLinkToCurrentCompany = isCurrentUserAdmin
            ? request.LinkToCurrentCompany == true
            : true;

        var user = new User
        {
            CompanyId = shouldLinkToCurrentCompany ? resolvedCompanyId.Value : 0,
            IsAdmin = isCurrentUserAdmin && request.IsAdmin == true,
            Username = username,
            Email = request.Email?.Trim(),
            Phone = request.Phone?.Trim(),
            Cpf = request.Cpf?.Trim(),
            FullName = request.FullName?.Trim(),
            Title = request.Title?.Trim(),
            Notes = request.Notes?.Trim()
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        user.CreatedAtUtc = DateTime.UtcNow;

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        if (shouldLinkToCurrentCompany)
        {
            dbContext.UserCompanies.Add(new UserCompany
            {
                UserId = user.Id,
                CompanyId = resolvedCompanyId.Value,
                AssignedAtUtc = DateTime.UtcNow,
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var company = await dbContext.Companies.FirstAsync(c => c.Id == resolvedCompanyId.Value, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, new UserProfileResponse(user.Id, user.Username, user.IsAdmin, company.Id, company.Name, company.UniqueCode, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<UserProfileResponse>> Update(int id, [FromQuery] int? companyId, [FromBody] UpdateUserRequest request, CancellationToken cancellationToken)
    {
        var resolvedCompanyId = await ResolveCompanyIdAsync(companyId, cancellationToken);
        if (resolvedCompanyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var isMember = await dbContext.UserCompanies.AnyAsync(mapping => mapping.UserId == id && mapping.CompanyId == resolvedCompanyId.Value, cancellationToken);
        if (!isMember)
        {
            return NotFound();
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return NotFound();
        }

        var username = request.Username?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest("Username is required.");
        }

        var usernameExists = await dbContext.Users.AnyAsync(u => u.Username == username && u.Id != id, cancellationToken);
        if (usernameExists)
        {
            return Conflict("Username already exists.");
        }

        var isCurrentUserAdmin = IsCurrentUserAdmin();
        if (!isCurrentUserAdmin && request.IsAdmin.HasValue && request.IsAdmin.Value != user.IsAdmin)
        {
            return Forbid("Only administrators can change administrator flag.");
        }

        var currentUserIdClaim = User.FindFirst("sub")?.Value;
        var isSelfUpdate = int.TryParse(currentUserIdClaim, out var currentUserId) && currentUserId == id;
        var requestedTitle = request.Title?.Trim();
        var currentTitle = user.Title?.Trim();
        if (isSelfUpdate && !string.Equals(requestedTitle, currentTitle, StringComparison.Ordinal))
        {
            return Forbid("You cannot change your own title.");
        }

        user.Username = username;
        user.Email = request.Email?.Trim();
        user.Phone = request.Phone?.Trim();
        user.Cpf = request.Cpf?.Trim();
        user.FullName = request.FullName?.Trim();
        if (isCurrentUserAdmin)
        {
            user.IsAdmin = request.IsAdmin == true;
        }
        if (!isSelfUpdate)
        {
            user.Title = requestedTitle;
        }
        user.Notes = request.Notes?.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        var company = await dbContext.Companies.FirstAsync(c => c.Id == resolvedCompanyId.Value, cancellationToken);

        return Ok(new UserProfileResponse(user.Id, user.Username, user.IsAdmin, company.Id, company.Name, company.UniqueCode, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, [FromQuery] int? companyId, CancellationToken cancellationToken)
    {
        var resolvedCompanyId = await ResolveCompanyIdAsync(companyId, cancellationToken);
        if (resolvedCompanyId is null)
        {
            return Unauthorized("Company not found in token.");
        }

        var userCompany = await dbContext.UserCompanies.FirstOrDefaultAsync(mapping => mapping.UserId == id && mapping.CompanyId == resolvedCompanyId.Value, cancellationToken);
        if (userCompany is null)
        {
            return NotFound();
        }

        dbContext.UserCompanies.Remove(userCompany);
        await dbContext.SaveChangesAsync(cancellationToken);

        var hasAnyCompany = await dbContext.UserCompanies.AnyAsync(mapping => mapping.UserId == id, cancellationToken);
        if (hasAnyCompany)
        {
            return NoContent();
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return NoContent();
        }

        dbContext.Users.Remove(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        return NoContent();
    }
}
