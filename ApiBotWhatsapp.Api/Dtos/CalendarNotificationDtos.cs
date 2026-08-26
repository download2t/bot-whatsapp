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

// Manual "send now" test, independent of IsEnabled/NotifyHour/dedupe — lets the user confirm
// the number/WhatsApp connection works before trusting the automatic schedule. Sends with
// sample name/age, not tied to any real CalendarPerson.
public record CalendarBirthdayNotificationTestRequest(string TargetPhoneNumber, string? MessageTemplate);

public record CalendarBirthdayNotificationTestResponse(bool Success, string Status);
