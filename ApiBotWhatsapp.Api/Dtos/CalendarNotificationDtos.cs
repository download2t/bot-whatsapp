namespace ApiBotWhatsapp.Api.Dtos;

public record CalendarBirthdayNotificationSettingResponse(
    bool IsEnabled,
    string? TargetPhoneNumber,
    string? MessageTemplate,
    int NotifyHour,
    int NotifyMinute,
    bool WhatsAppConnected);

public record CalendarBirthdayNotificationSettingRequest(
    bool IsEnabled,
    string TargetPhoneNumber,
    string? MessageTemplate,
    int NotifyHour,
    int NotifyMinute);

public record CalendarBirthdayNotificationLogResponse(
    int Id,
    string PersonName,
    DateOnly NotificationDate,
    DateTime SentAtUtc,
    bool Success,
    string? StatusDetail);
