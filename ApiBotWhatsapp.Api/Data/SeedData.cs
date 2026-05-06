using ApiBotWhatsapp.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public static class SeedData
{
    public const string DefaultCompanyCode = "EMPRESA-TESTE";

    public static async Task InitializeAsync(AppDbContext dbContext)
    {
        // Criar ou obter empresa padrão
        var company = dbContext.Companies.FirstOrDefault(c => c.UniqueCode == DefaultCompanyCode);
        if (company == null)
        {
            company = new Company
            {
                Name = "Empresa Teste",
                UniqueCode = DefaultCompanyCode,
                CreatedAtUtc = DateTime.UtcNow
            };
            dbContext.Companies.Add(company);
            await dbContext.SaveChangesAsync();
        }

        // Garantir que usuário admin existe
        var adminExists = dbContext.Users.Any(u => u.Username == "admin");
        if (!adminExists)
        {
            var adminUser = new User
            {
                Username = "admin",
                FullName = "Administrador",
                Email = "admin@empresa.local",
                Phone = "(11) 99999-9999",
                IsAdmin = true,
                CompanyId = company.Id,
                CreatedAtUtc = DateTime.UtcNow
            };

            var hasher = new PasswordHasher<User>();
            adminUser.PasswordHash = hasher.HashPassword(adminUser, "admin123");
            dbContext.Users.Add(adminUser);
            await dbContext.SaveChangesAsync();
            
            Console.WriteLine($"[SEED] Admin user created with ID: {adminUser.Id}, CompanyId: {company.Id}");

            // IMPORTANTE: Adicionar o usuário à empresa
            if (adminUser.Id > 0)
            {
                dbContext.UserCompanies.Add(new UserCompany
                {
                    UserId = adminUser.Id,
                    CompanyId = company.Id,
                    AssignedAtUtc = DateTime.UtcNow
                });
                await dbContext.SaveChangesAsync();
                Console.WriteLine($"[SEED] UserCompany created for admin user {adminUser.Id}");
            }
            else
            {
                Console.WriteLine($"[SEED] WARNING: Admin user ID is {adminUser.Id}, cannot create UserCompany!");
            }
        }
        else
        {
            Console.WriteLine("[SEED] Admin user already exists, skipping creation");
        }
    }
}
