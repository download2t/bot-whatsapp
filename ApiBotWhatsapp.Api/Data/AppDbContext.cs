using ApiBotWhatsapp.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<UserCompany> UserCompanies => Set<UserCompany>();
    public DbSet<ScheduleRule> ScheduleRules => Set<ScheduleRule>();
    public DbSet<ScheduleRuleWhatsAppNumber> ScheduleRuleWhatsAppNumbers => Set<ScheduleRuleWhatsAppNumber>();
    public DbSet<WhitelistNumber> WhitelistNumbers => Set<WhitelistNumber>();
    public DbSet<MessageLog> MessageLogs => Set<MessageLog>();
    public DbSet<Turma> Turmas => Set<Turma>();
    public DbSet<Contato> Contatos => Set<Contato>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(user => user.Username)
            .IsUnique();

        modelBuilder.Entity<UserCompany>()
            .HasKey(item => new { item.UserId, item.CompanyId });

        modelBuilder.Entity<UserCompany>()
            .HasIndex(item => item.CompanyId);

        modelBuilder.Entity<WhitelistNumber>()
            .HasIndex(number => new { number.CompanyId, number.PhoneNumber })
            .IsUnique();

        modelBuilder.Entity<Company>()
            .HasIndex(company => company.UniqueCode)
            .IsUnique();

        modelBuilder.Entity<MessageLog>()
            .HasIndex(log => new { log.CompanyId, log.WhatsAppNumber, log.TimestampUtc });

        modelBuilder.Entity<Turma>()
            .HasIndex(t => new { t.CompanyId, t.Name });

        modelBuilder.Entity<Contato>()
            .HasIndex(c => new { c.CompanyId, c.PhoneNumber });

        modelBuilder.Entity<ScheduleRule>()
            .HasIndex(rule => new { rule.CompanyId, rule.WhatsAppNumber });

        modelBuilder.Entity<ScheduleRuleWhatsAppNumber>()
            .HasKey(item => new { item.ScheduleRuleId, item.WhatsAppNumber });

        modelBuilder.Entity<ScheduleRuleWhatsAppNumber>()
            .HasIndex(item => item.WhatsAppNumber);

        modelBuilder.Entity<ScheduleRule>()
            .Property(rule => rule.StartTime)
            .HasConversion(
                value => value.ToString(@"hh\:mm"),
                value => TimeSpan.Parse(value));

        modelBuilder.Entity<ScheduleRule>()
            .Property(rule => rule.EndTime)
            .HasConversion(
                value => value.ToString(@"hh\:mm"),
                value => TimeSpan.Parse(value));

        base.OnModelCreating(modelBuilder);
    }
}
