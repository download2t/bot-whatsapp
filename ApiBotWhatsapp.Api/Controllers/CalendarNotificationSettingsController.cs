using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Services;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

// Unlike CalendarPeople/CalendarReminders (shared), this IS scoped by OwnerUserId — see
// CalendarBirthdayNotificationSetting for why: sending only ever happens through the caller's
// own connected WhatsApp session.
[ApiController]
[Route("api/calendar/notification-settings")]
public class CalendarNotificationSettingsController(AppDbContext dbContext, WhatsAppBridgeClient bridgeClient, WhatsAppMessageSender messageSender) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<CalendarBirthdayNotificationSettingResponse>> Get(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();
        var setting = await dbContext.CalendarBirthdayNotificationSettings
            .FirstOrDefaultAsync(s => s.OwnerUserId == ownerUserId, cancellationToken);

        var status = await bridgeClient.GetSessionStatusAsync($"user-{ownerUserId}", cancellationToken);

        return Ok(new CalendarBirthdayNotificationSettingResponse(
            setting?.IsEnabled ?? false,
            setting?.TargetPhoneNumber,
            setting?.MessageTemplate,
            setting?.NotifyHour ?? 8,
            setting?.NotifyMinute ?? 0,
            status.IsConnected));
    }

    [HttpPut]
    public async Task<ActionResult<CalendarBirthdayNotificationSettingResponse>> Update([FromBody] CalendarBirthdayNotificationSettingRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var normalizedPhone = PhoneNumberUtils.Normalize(request.TargetPhoneNumber);
        if (request.IsEnabled && string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return BadRequest("TargetPhoneNumber is required to enable notifications.");
        }

        if (request.NotifyHour is < 0 or > 23 || request.NotifyMinute is < 0 or > 59)
        {
            return BadRequest("Invalid notification time.");
        }

        var setting = await dbContext.CalendarBirthdayNotificationSettings
            .FirstOrDefaultAsync(s => s.OwnerUserId == ownerUserId, cancellationToken);

        if (setting is null)
        {
            setting = new CalendarBirthdayNotificationSetting
            {
                OwnerUserId = ownerUserId,
                CreatedAtUtc = DateTime.UtcNow
            };
            dbContext.CalendarBirthdayNotificationSettings.Add(setting);
        }

        setting.IsEnabled = request.IsEnabled;
        setting.TargetPhoneNumber = string.IsNullOrWhiteSpace(normalizedPhone) ? null : normalizedPhone;
        setting.MessageTemplate = string.IsNullOrWhiteSpace(request.MessageTemplate) ? null : request.MessageTemplate.Trim();
        setting.NotifyHour = request.NotifyHour;
        setting.NotifyMinute = request.NotifyMinute;
        setting.UpdatedAtUtc = DateTime.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);

        var status = await bridgeClient.GetSessionStatusAsync($"user-{ownerUserId}", cancellationToken);

        return Ok(new CalendarBirthdayNotificationSettingResponse(
            setting.IsEnabled,
            setting.TargetPhoneNumber,
            setting.MessageTemplate,
            setting.NotifyHour,
            setting.NotifyMinute,
            status.IsConnected));
    }

    // Manual test send — lets the user confirm the number/WhatsApp connection actually works
    // before relying on the automatic daily check. Uses sample data (not a real CalendarPerson),
    // is not gated by IsEnabled/NotifyHour, and is never written to CalendarBirthdayNotificationLog
    // (that log is reserved for real automatic dispatches, not manual tests).
    [HttpPost("test")]
    public async Task<ActionResult<CalendarBirthdayNotificationTestResponse>> SendTest([FromBody] CalendarBirthdayNotificationTestRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var normalizedPhone = PhoneNumberUtils.Normalize(request.TargetPhoneNumber);
        if (string.IsNullOrWhiteSpace(normalizedPhone))
        {
            return BadRequest("Informe um número para o teste.");
        }

        var text = "[TESTE] " + CalendarBirthdayNotifierService.BuildMessage(request.MessageTemplate, "Fulano de Tal", 30);

        var result = await messageSender.SendMessageAsync(
            normalizedPhone,
            text,
            markAsUnread: false,
            senderSessionId: $"user-{ownerUserId}",
            cancellationToken);

        return Ok(new CalendarBirthdayNotificationTestResponse(result.Success, result.Status));
    }

    [HttpGet("log")]
    public async Task<ActionResult<IEnumerable<CalendarBirthdayNotificationLogResponse>>> GetLog(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var logs = await dbContext.CalendarBirthdayNotificationLogs
            .Where(l => l.OwnerUserId == ownerUserId)
            .OrderByDescending(l => l.SentAtUtc)
            .Take(30)
            .Select(l => new CalendarBirthdayNotificationLogResponse(
                l.Id, l.PersonName, l.NotificationDate, l.SentAtUtc, l.Success, l.StatusDetail))
            .ToListAsync(cancellationToken);

        return Ok(logs);
    }
}
