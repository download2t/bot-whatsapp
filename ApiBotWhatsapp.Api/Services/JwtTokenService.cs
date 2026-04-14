using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ApiBotWhatsapp.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace ApiBotWhatsapp.Api.Services;

public class JwtTokenService(IConfiguration configuration)
{
    public (string Token, DateTime ExpiresAtUtc) GenerateToken(
        User user,
        int? activeCompanyId = null,
        string? activeCompanyName = null,
        string? activeCompanyCode = null)
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
            new(ClaimTypes.Name, user.Username),
            new("is_admin", user.IsAdmin ? "true" : "false")
        };

        if (activeCompanyId is not null)
        {
            claims.Add(new Claim("company_id", activeCompanyId.Value.ToString()));

            if (!string.IsNullOrWhiteSpace(activeCompanyName))
            {
                claims.Add(new Claim("company_name", activeCompanyName));
            }

            if (!string.IsNullOrWhiteSpace(activeCompanyCode))
            {
                claims.Add(new Claim("company_code", activeCompanyCode));
            }
        }

        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            expires: expiresAtUtc,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAtUtc);
    }
}
