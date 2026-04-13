namespace ApiBotWhatsapp.Api.Dtos;

public record ScheduleRuleRequest(
    string Name,
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
    string StartTime,
    string EndTime,
    string Message,
    bool IsEnabled,
    int ThrottleMinutes,
    bool IsOutOfBusinessHours,
    int? MaxDailyMessagesPerUser,
    DateTime CreatedAtUtc);
