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

        var username = request.Username.Trim();
        var exists = await dbContext.Users.AnyAsync(user => user.Username == username, cancellationToken);
        if (exists)
        {
            return Conflict("Username already exists.");
        }

        var user = new User
        {
            Username = username
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
    user.CreatedAtUtc = DateTime.UtcNow;

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(Register), new { id = user.Id }, new { user.Id, user.Username });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
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

        var (token, expiresAtUtc) = tokenService.GenerateToken(user);
        return Ok(new LoginResponse(token, expiresAtUtc, user.Username));
    }

    [HttpGet("me")]
    public async Task<ActionResult<UserProfileResponse>> Me(CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized("User not found.");
        }

        return Ok(new UserProfileResponse(user.Id, user.Username, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
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

        user.Username = username;
        user.Email = request.Email?.Trim();
        user.Phone = request.Phone?.Trim();
        user.Cpf = request.Cpf?.Trim();
        user.FullName = request.FullName?.Trim();
        user.Title = request.Title?.Trim();
        user.Notes = request.Notes?.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;
        
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new UserProfileResponse(user.Id, user.Username, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc));
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
}
