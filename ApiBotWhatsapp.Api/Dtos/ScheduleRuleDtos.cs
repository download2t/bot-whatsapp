namespace ApiBotWhatsapp.Api.Dtos;

public record ScheduleRuleTimeWindowRequest(int DayOfWeek, string StartTime, string EndTime);

public record ScheduleRuleTimeWindowResponse(int DayOfWeek, string DayName, string StartTime, string EndTime);

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
    int? MaxDailyMessagesPerUser = null,
    IReadOnlyList<ScheduleRuleTimeWindowRequest>? Windows = null);

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
    DateTime CreatedAtUtc,
    IReadOnlyList<ScheduleRuleTimeWindowResponse> Windows);
