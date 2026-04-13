using ApiBotWhatsapp.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<ScheduleRule> ScheduleRules => Set<ScheduleRule>();
    public DbSet<WhitelistNumber> WhitelistNumbers => Set<WhitelistNumber>();
    public DbSet<MessageLog> MessageLogs => Set<MessageLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(user => user.Username)
            .IsUnique();

        modelBuilder.Entity<WhitelistNumber>()
            .HasIndex(number => number.PhoneNumber)
            .IsUnique();

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
