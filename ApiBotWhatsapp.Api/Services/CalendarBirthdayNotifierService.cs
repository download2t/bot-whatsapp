using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Services;

// Checks every few minutes whether any CalendarBirthdayNotificationSetting owner needs to be
// told "today is so-and-so's birthday" — a periodic poll rather than a fixed-time cron because
// it needs no scheduler infrastructure and is naturally idempotent: CalendarBirthdayNotificationLog's
// unique (OwnerUserId, CalendarPersonId, NotificationDate) index means re-checking constantly
// (or after a restart mid-day) can never re-send the same person's notice twice in one day.
public class CalendarBirthdayNotifierService(
    IServiceScopeFactory scopeFactory,
    ILogger<CalendarBirthdayNotifierService> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(5);

    public const string DefaultMessageTemplate =
        "🎂 Hoje é aniversário de *{nome}*! Está completando {idade} anos. Prepare uma surpresa ou homenagem! 🎉";

    // Shared with CalendarNotificationSettingsController's manual "send a test" endpoint, so a
    // test message is built with the exact same {nome}/{idade} substitution as a real one.
    public static string BuildMessage(string? template, string name, int age)
    {
        var effective = string.IsNullOrWhiteSpace(template) ? DefaultMessageTemplate : template;
        return effective.Replace("{nome}", name).Replace("{idade}", age.ToString());
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval);

        do
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogError(ex, "CalendarBirthdayNotifierService tick failed.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var messageSender = scope.ServiceProvider.GetRequiredService<WhatsAppMessageSender>();

        var now = TimeZoneHelper.GetCurrentLocalTime(configuration);
        var today = DateOnly.FromDateTime(now);

        var settings = await dbContext.CalendarBirthdayNotificationSettings
            .Where(s => s.IsEnabled && s.TargetPhoneNumber != null)
            .ToListAsync(cancellationToken);

        if (settings.Count == 0)
        {
            return;
        }

        // Small congregation-sized list (hundreds, not thousands) — cheaper to pull once and
        // filter in memory than to push month/day matching down into SQLite per setting.
        var people = await dbContext.CalendarPeople
            .Where(p => p.IsActive && p.BirthDate != null)
            .ToListAsync(cancellationToken);

        var birthdayPeople = people
            .Where(p => p.BirthDate!.Value.Month == today.Month && p.BirthDate!.Value.Day == today.Day)
            .ToList();

        if (birthdayPeople.Count == 0)
        {
            return;
        }

        foreach (var setting in settings)
        {
            var nowTimeOfDay = new TimeOnly(now.Hour, now.Minute);
            var notifyAt = new TimeOnly(setting.NotifyHour, setting.NotifyMinute);
            if (nowTimeOfDay < notifyAt)
            {
                continue;
            }

            foreach (var person in birthdayPeople)
            {
                var alreadySent = await dbContext.CalendarBirthdayNotificationLogs.AnyAsync(
                    l => l.OwnerUserId == setting.OwnerUserId && l.CalendarPersonId == person.Id && l.NotificationDate == today,
                    cancellationToken);

                if (alreadySent)
                {
                    continue;
                }

                var age = today.Year - person.BirthDate!.Value.Year;
                var text = BuildMessage(setting.MessageTemplate, person.Name, age);

                var result = await messageSender.SendMessageAsync(
                    setting.TargetPhoneNumber!,
                    text,
                    markAsUnread: true,
                    senderSessionId: $"user-{setting.OwnerUserId}",
                    cancellationToken);

                dbContext.CalendarBirthdayNotificationLogs.Add(new CalendarBirthdayNotificationLog
                {
                    OwnerUserId = setting.OwnerUserId,
                    CalendarPersonId = person.Id,
                    PersonName = person.Name,
                    NotificationDate = today,
                    SentAtUtc = DateTime.UtcNow,
                    Success = result.Success,
                    StatusDetail = result.Status
                });

                if (!result.Success)
                {
                    logger.LogWarning(
                        "Birthday notification failed for OwnerUserId {OwnerUserId}, person {PersonId}: {Status}",
                        setting.OwnerUserId, person.Id, result.Status);
                }
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
