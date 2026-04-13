using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ApiBotWhatsapp.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace ApiBotWhatsapp.Api.Services;

public class JwtTokenService(IConfiguration configuration)
{
    public (string Token, DateTime ExpiresAtUtc) GenerateToken(User user)
    {
        var jwtSection = configuration.GetSection("Jwt");
        var issuer = jwtSection["Issuer"] ?? throw new InvalidOperationException("Missing Jwt:Issuer");
        var audience = jwtSection["Audience"] ?? throw new InvalidOperationException("Missing Jwt:Audience");
        var signingKey = jwtSection["SigningKey"] ?? throw new InvalidOperationException("Missing Jwt:SigningKey");
        var expiresMinutes = int.TryParse(jwtSection["ExpiresMinutes"], out var value) ? value : 120;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiresAtUtc = DateTime.UtcNow.AddMinutes(expiresMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.Username),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username)
        };

        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            expires: expiresAtUtc,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAtUtc);
    }
}
