using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public static class SeedData
{
    public static async Task InitializeAsync(AppDbContext dbContext)
    {
        var adminExists = dbContext.Users.Any(u => u.Username == "admin");
        if (adminExists)
        {
            return;
        }

        var adminUser = new User
        {
            Username = "admin",
            FullName = "Matheus Barros",
            Email = "mtduarte.b@gmail.com",
            Phone = "(45) 99860-1143",
            IsAdmin = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        var hasher = new PasswordHasher<User>();
        adminUser.PasswordHash = hasher.HashPassword(adminUser, "admin123");
        dbContext.Users.Add(adminUser);
        await dbContext.SaveChangesAsync();
    }
}
