using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public static class SeedData
{
    public static async Task InitializeAsync(AppDbContext dbContext)
    {
        if (await dbContext.Users.AnyAsync())
        {
            return;
        }

        var adminUser = new User
        {
            Username = "admin"
        };

        var passwordHasher = new PasswordHasher<User>();
        adminUser.PasswordHash = passwordHasher.HashPassword(adminUser, "admin123");

        dbContext.Users.Add(adminUser);
        await dbContext.SaveChangesAsync();
    }
}
