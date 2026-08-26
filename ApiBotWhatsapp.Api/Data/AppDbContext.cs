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
    public DbSet<BulkCampaign> BulkCampaigns => Set<BulkCampaign>();
    public DbSet<BulkCampaignItem> BulkCampaignItems => Set<BulkCampaignItem>();
    public DbSet<Pais> Paises => Set<Pais>();
    public DbSet<ChatFlow> ChatFlows => Set<ChatFlow>();
    public DbSet<ChatFlowStep> ChatFlowSteps => Set<ChatFlowStep>();
    public DbSet<ChatFlowOption> ChatFlowOptions => Set<ChatFlowOption>();
    public DbSet<ChatFlowConversation> ChatFlowConversations => Set<ChatFlowConversation>();
    public DbSet<ConversationState> ConversationStates => Set<ConversationState>();
    public DbSet<CalendarPerson> CalendarPeople => Set<CalendarPerson>();
    public DbSet<CalendarReminder> CalendarReminders => Set<CalendarReminder>();
    public DbSet<CalendarBirthdayNotificationSetting> CalendarBirthdayNotificationSettings => Set<CalendarBirthdayNotificationSetting>();
    public DbSet<CalendarBirthdayNotificationLog> CalendarBirthdayNotificationLogs => Set<CalendarBirthdayNotificationLog>();

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

        modelBuilder.Entity<BulkCampaign>()
            .HasIndex(c => new { c.OwnerUserId, c.CreatedAtUtc });

        modelBuilder.Entity<BulkCampaignItem>()
            .HasIndex(i => i.BulkCampaignId);

        modelBuilder.Entity<BulkCampaignItem>()
            .HasOne(i => i.BulkCampaign)
            .WithMany(c => c.Items)
            .HasForeignKey(i => i.BulkCampaignId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Pais>()
            .HasIndex(p => new { p.OwnerUserId, p.Ddi })
            .IsUnique();

        modelBuilder.Entity<ChatFlow>()
            .HasIndex(f => f.OwnerUserId);

        modelBuilder.Entity<ChatFlowStep>()
            .HasOne(s => s.ChatFlow)
            .WithMany(f => f.Steps)
            .HasForeignKey(s => s.ChatFlowId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ChatFlowOption>()
            .HasOne(o => o.ChatFlowStep)
            .WithMany(s => s.Options)
            .HasForeignKey(o => o.ChatFlowStepId)
            .OnDelete(DeleteBehavior.Cascade);

        // Separate, non-owning relationship (an option pointing at whichever step comes next).
        // Restrict instead of Cascade: deleting a step must never silently cascade-delete an
        // option that lives on a *different* step just because it targeted this one — flow
        // deletion/replacement is handled explicitly in ChatFlowsController in a safe order.
        modelBuilder.Entity<ChatFlowOption>()
            .HasOne(o => o.NextStep)
            .WithMany()
            .HasForeignKey(o => o.NextStepId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ChatFlowConversation>()
            .HasIndex(c => new { c.OwnerUserId, c.PhoneNumber })
            .IsUnique();

        modelBuilder.Entity<ChatFlowConversation>()
            .HasOne(c => c.CurrentStep)
            .WithMany()
            .HasForeignKey(c => c.CurrentStepId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<ConversationState>()
            .HasIndex(s => new { s.OwnerUserId, s.PhoneNumber })
            .IsUnique();

        modelBuilder.Entity<CalendarPerson>()
            .HasIndex(p => p.Name);

        modelBuilder.Entity<CalendarReminder>()
            .HasIndex(r => r.Date);

        // Restrict, not Cascade: deleting a person must not wipe out reminders that reference
        // them — just detach (CalendarPersonId becomes null) so the reminder itself survives.
        modelBuilder.Entity<CalendarReminder>()
            .HasOne(r => r.CalendarPerson)
            .WithMany()
            .HasForeignKey(r => r.CalendarPersonId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<CalendarBirthdayNotificationSetting>()
            .HasIndex(s => s.OwnerUserId)
            .IsUnique();

        // Dedupe key for CalendarBirthdayNotifierService: guarantees the same person can't be
        // notified twice for the same user on the same day, regardless of how often the
        // background tick runs or whether the process restarted mid-day.
        modelBuilder.Entity<CalendarBirthdayNotificationLog>()
            .HasIndex(l => new { l.OwnerUserId, l.CalendarPersonId, l.NotificationDate })
            .IsUnique();

        // SetNull, not Restrict: a notification log is a historical audit record (it keeps its
        // own PersonName snapshot) — deleting a person must never be blocked by old logs.
        modelBuilder.Entity<CalendarBirthdayNotificationLog>()
            .HasOne(l => l.CalendarPerson)
            .WithMany()
            .HasForeignKey(l => l.CalendarPersonId)
            .OnDelete(DeleteBehavior.SetNull);

        base.OnModelCreating(modelBuilder);
    }
}
