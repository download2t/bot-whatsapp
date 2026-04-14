using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public static class SeedData
{
    public const string DefaultCompanyCode = "EMPRESA-TESTE";

    public static async Task InitializeAsync(AppDbContext dbContext)
    {
        // Seed removido - configure manualmente via API
        await Task.CompletedTask;
    }
}
