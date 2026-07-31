using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

// Manages user ACCOUNTS (login, password, admin flag). This is Admin-only and entirely
// separate from each user's own isolated WhatsApp data (contacts/rules/messages/connection),
// which is never visible here or anywhere else outside its owner.
[ApiController]
[Route("api/users")]
public class UsersController(AppDbContext dbContext) : ControllerBase
{
    private readonly PasswordHasher<User> _passwordHasher = new();

    private bool IsCurrentUserAdmin()
    {
        return string.Equals(User.FindFirst("is_admin")?.Value, "true", StringComparison.OrdinalIgnoreCase);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<UserListResponse>>> GetAll(CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var users = await dbContext.Users
            .OrderByDescending(user => user.CreatedAtUtc)
            .Select(user => new UserListResponse(user.Id, user.Username, user.IsAdmin, user.Email, user.Phone, user.FullName, user.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(users);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UserProfileResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return NotFound();
        }

        return Ok(ToProfileResponse(user));
    }

    [HttpPost]
    public async Task<ActionResult<UserProfileResponse>> Create([FromBody] CreateUserRequest request, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
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

        var user = new User
        {
            IsAdmin = request.IsAdmin == true,
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

        return CreatedAtAction(nameof(GetById), new { id = user.Id }, ToProfileResponse(user));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<UserProfileResponse>> Update(int id, [FromBody] UpdateUserRequest request, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
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

        user.Username = username;
        user.Email = request.Email?.Trim();
        user.Phone = request.Phone?.Trim();
        user.Cpf = request.Cpf?.Trim();
        user.FullName = request.FullName?.Trim();
        user.IsAdmin = request.IsAdmin == true;
        user.Title = request.Title?.Trim();
        user.Notes = request.Notes?.Trim();
        user.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        return Ok(ToProfileResponse(user));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        if (!IsCurrentUserAdmin())
        {
            return Forbid();
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (user is null)
        {
            return NotFound();
        }

        dbContext.Users.Remove(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        return NoContent();
    }

    private static UserProfileResponse ToProfileResponse(User user) =>
        new(user.Id, user.Username, user.IsAdmin, user.Email, user.Phone, user.Cpf, user.FullName, user.Title, user.Notes, user.CreatedAtUtc);
}
