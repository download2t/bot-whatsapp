namespace ApiBotWhatsapp.Api.Dtos;

public record ScheduleRuleRequest(
    string Name,
    IReadOnlyList<string>? WhatsAppNumbers,
    string? WhatsAppNumber,
    string StartTime,
    string EndTime,
    string Message,
    bool IsEnabled,
    int ThrottleMinutes = 0,
    bool IsOutOfBusinessHours = false,
    int? MaxDailyMessagesPerUser = null);

public record ScheduleRuleResponse(
    int Id,
    string Name,
    IReadOnlyList<string> WhatsAppNumbers,
    string WhatsAppNumber,
    string StartTime,
    string EndTime,
    string Message,
    bool IsEnabled,
    int ThrottleMinutes,
    bool IsOutOfBusinessHours,
    int? MaxDailyMessagesPerUser,
    DateTime CreatedAtUtc);
