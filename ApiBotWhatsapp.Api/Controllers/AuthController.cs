using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext dbContext, JwtTokenService tokenService) : ControllerBase
{
    private readonly PasswordHasher<User> _passwordHasher = new();

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest("Username and password are required.");
        }

        var company = await dbContext.Companies.FirstOrDefaultAsync(c => c.UniqueCode == SeedData.DefaultCompanyCode, cancellationToken);
        if (company is null)
        {
            return BadRequest("Default company is not configured.");
        }

        var username = request.Username.Trim();
        var exists = await dbContext.Users.AnyAsync(user => user.Username == username, cancellationToken);
        if (exists)
        {
            return Conflict("Username already exists.");
        }

        var user = new User
        {
            Username = username,
            CompanyId = company.Id,
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        user.CreatedAtUtc = DateTime.UtcNow;

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        dbContext.UserCompanies.Add(new UserCompany
        {
            UserId = user.Id,
            CompanyId = company.Id,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(Register), new { id = user.Id }, new { user.Id, user.Username });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest("Username and password are required.");
        }

        var username = request.Username.Trim();
        var user = await dbContext.Users.FirstOrDefaultAsync(item => item.Username == username, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid credentials.");
        }

        var result = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
        {
            return Unauthorized("Invalid credentials.");
        }

        var companies = await GetUserCompaniesAsync(user.Id, cancellationToken);
        if (companies.Count == 0)
        {
            if (user.IsAdmin)
            {
                var (adminToken, adminExpiresAtUtc) = tokenService.GenerateToken(user);
                return Ok(new LoginResponse(
                    adminToken,
                    adminExpiresAtUtc,
                    user.Username,
                    user.IsAdmin,
                    user.Title,
                    null,
                    null,
                    null,
                    false,
                    []));
            }

            return Unauthorized("User has no company assigned.");
        }

        if (companies.Count == 1)
        {
            var currentCompany = companies[0];
            var (token, expiresAtUtc) = tokenService.GenerateToken(user, currentCompany.CompanyId, currentCompany.CompanyName, currentCompany.CompanyCode);
            var selectedCompanies = companies
                .Select(item => item with { IsCurrent = item.CompanyId == currentCompany.CompanyId })
                .ToList();

            return Ok(new LoginResponse(
                token,
                expiresAtUtc,
                user.Username,
                user.IsAdmin,
                user.Title,
                currentCompany.CompanyId,
                currentCompany.CompanyName,
                currentCompany.CompanyCode,
                false,
                selectedCompanies));
        }

        var (selectionToken, selectionExpiresAtUtc) = tokenService.GenerateToken(user);
        return Ok(new LoginResponse(
            selectionToken,
            selectionExpiresAtUtc,
            user.Username,
            user.IsAdmin,
            user.Title,
            null,
            null,
            null,
            true,
            companies));
    }

    [HttpGet("companies")]
    public async Task<ActionResult<IReadOnlyList<CompanyOptionResponse>>> GetCompanies(CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        var currentCompanyId = GetCurrentCompanyId();
        var companies = await GetUserCompaniesAsync(user.Id, cancellationToken);
        var normalized = companies
            .Select(item => item with { IsCurrent = currentCompanyId is not null && currentCompanyId.Value == item.CompanyId })
            .ToList();

        return Ok(normalized);
    }

    [HttpPost("select-company")]
    public async Task<ActionResult<LoginResponse>> SelectCompany([FromBody] SelectCompanyRequest request, CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        var selectedCompany = await dbContext.UserCompanies
            .AsNoTracking()
            .Where(item => item.UserId == user.Id && item.CompanyId == request.CompanyId)
            .Join(
                dbContext.Companies.AsNoTracking(),
                mapping => mapping.CompanyId,
                company => company.Id,
                (mapping, company) => company)
            .FirstOrDefaultAsync(cancellationToken);

        if (selectedCompany is null)
        {
            return Forbid();
        }

        var companies = await GetUserCompaniesAsync(user.Id, cancellationToken);
        var (token, expiresAtUtc) = tokenService.GenerateToken(user, selectedCompany.Id, selectedCompany.Name, selectedCompany.UniqueCode);
        var selectedCompanies = companies
            .Select(item => item with { IsCurrent = item.CompanyId == selectedCompany.Id })
            .ToList();

        return Ok(new LoginResponse(
            token,
            expiresAtUtc,
            user.Username,
            user.IsAdmin,
            user.Title,
            selectedCompany.Id,
            selectedCompany.Name,
            selectedCompany.UniqueCode,
            false,
            selectedCompanies));
    }

    [HttpGet("me")]
    public async Task<ActionResult<UserProfileResponse>> Me(CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            var companies = await GetUserCompaniesAsync(user.Id, cancellationToken);
            companyId = companies.FirstOrDefault()?.CompanyId;
        }

        if (companyId is null)
        {
            if (!user.IsAdmin)
            {
                return BadRequest("No company selected for this user.");
            }

            return Ok(new UserProfileResponse(
                user.Id,
                user.Username,
                user.IsAdmin,
                0,
                "Sem empresa",
                string.Empty,
                user.Email,
                user.Phone,
                user.Cpf,
                user.FullName,
                user.Title,
                user.Notes,
                user.CreatedAtUtc));
        }

        var company = await dbContext.Companies.FirstAsync(c => c.Id == companyId.Value, cancellationToken);
        return Ok(new UserProfileResponse(user.Id, user.Username, user.IsAdmin, company.Id, company.Name, company.UniqueCode, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
    }

    [HttpPut("profile")]
    public async Task<ActionResult<UserProfileResponse>> UpdateProfile([FromBody] UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        var username = request.Username?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(username))
        {
            return BadRequest("Username is required.");
        }

        var exists = await dbContext.Users.AnyAsync(item => item.Username == username && item.Id != user.Id, cancellationToken);
        if (exists)
        {
            return Conflict("Username already exists.");
        }

        var requestedTitle = request.Title?.Trim();
        var currentTitle = user.Title?.Trim();
        if (!string.Equals(requestedTitle, currentTitle, StringComparison.Ordinal))
        {
            return Forbid("You cannot change your own title.");
        }

        user.Username = username;
        user.Email = request.Email?.Trim();
        user.Phone = request.Phone?.Trim();
        user.Cpf = request.Cpf?.Trim();
        user.FullName = request.FullName?.Trim();
        user.Notes = request.Notes?.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;
        
        await dbContext.SaveChangesAsync(cancellationToken);
        var companyId = GetCurrentCompanyId();
        if (companyId is null)
        {
            var companies = await GetUserCompaniesAsync(user.Id, cancellationToken);
            companyId = companies.FirstOrDefault()?.CompanyId;
        }

        if (companyId is null)
        {
            if (!user.IsAdmin)
            {
                return BadRequest("No company selected for this user.");
            }

            return Ok(new UserProfileResponse(
                user.Id,
                user.Username,
                user.IsAdmin,
                0,
                "Sem empresa",
                string.Empty,
                user.Email,
                user.Phone,
                user.Cpf,
                user.FullName,
                user.Title,
                user.Notes,
                user.CreatedAtUtc));
        }

        var company = await dbContext.Companies.FirstAsync(c => c.Id == companyId.Value, cancellationToken);
        return Ok(new UserProfileResponse(user.Id, user.Username, user.IsAdmin, company.Id, company.Name, company.UniqueCode, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
    }

    [HttpPut("change-password")]
    public async Task<ActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        if (string.IsNullOrWhiteSpace(request.CurrentPassword) || string.IsNullOrWhiteSpace(request.NewPassword))
        {
            return BadRequest("CurrentPassword and NewPassword are required.");
        }

        if (request.NewPassword.Length < 6)
        {
            return BadRequest("NewPassword must contain at least 6 characters.");
        }

        var currentOk = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);
        if (currentOk == PasswordVerificationResult.Failed)
        {
            return BadRequest("Current password is invalid.");
        }

        user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task<User?> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(idClaim, out var userId))
        {
            return null;
        }

        return await dbContext.Users.FirstOrDefaultAsync(item => item.Id == userId, cancellationToken);
    }

    private int? GetCurrentCompanyId()
    {
        var claim = User.FindFirst("company_id")?.Value;
        return int.TryParse(claim, out var companyId) ? companyId : null;
    }

    private async Task<List<CompanyOptionResponse>> GetUserCompaniesAsync(int userId, CancellationToken cancellationToken)
    {
        return await dbContext.UserCompanies
            .AsNoTracking()
            .Where(item => item.UserId == userId)
            .Join(
                dbContext.Companies.AsNoTracking(),
                mapping => mapping.CompanyId,
                company => company.Id,
                (mapping, company) => new { company.Id, company.Name, company.UniqueCode })
            .OrderBy(item => item.Name)
            .Select(item => new CompanyOptionResponse(item.Id, item.Name, item.UniqueCode, false))
            .ToListAsync(cancellationToken);
    }
}
