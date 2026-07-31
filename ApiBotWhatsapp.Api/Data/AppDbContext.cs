using ApiBotWhatsapp.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ScheduleRule> ScheduleRules => Set<ScheduleRule>();
    public DbSet<MessageLog> MessageLogs => Set<MessageLog>();
    public DbSet<Turma> Turmas => Set<Turma>();
    public DbSet<Contato> Contatos => Set<Contato>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(user => user.Username)
            .IsUnique();

        modelBuilder.Entity<MessageLog>()
            .HasIndex(log => new { log.OwnerUserId, log.WhatsAppNumber, log.TimestampUtc });

        modelBuilder.Entity<MessageLog>()
            .HasIndex(log => log.MessageId);

        modelBuilder.Entity<Turma>()
            .HasIndex(t => new { t.OwnerUserId, t.Name });

        modelBuilder.Entity<Contato>()
            .HasIndex(c => new { c.OwnerUserId, c.PhoneNumber });

        modelBuilder.Entity<ScheduleRule>()
            .HasIndex(rule => rule.OwnerUserId);

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
