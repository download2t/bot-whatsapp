namespace ApiBotWhatsapp.Api.Dtos;

public record ScheduleRuleTimeWindowRequest(int DayOfWeek, string StartTime, string EndTime);

public record ScheduleRuleTimeWindowResponse(int DayOfWeek, string DayName, string StartTime, string EndTime);

public record ScheduleRuleMessageRequest(string Text, IReadOnlyList<int> Days, int? PaisId = null, int? ChatFlowId = null);

public record ScheduleRuleMessageResponse(
    string Text,
    IReadOnlyList<int> Days,
    IReadOnlyList<string> DayNames,
    int? PaisId,
    string? PaisName,
    string? PaisDdi,
    int? ChatFlowId,
    string? ChatFlowName);

public record ScheduleRuleRequest(
    string Name,
    string StartTime,
    string EndTime,
    IReadOnlyList<ScheduleRuleMessageRequest> Messages,
    bool IsEnabled,
    int ThrottleMinutes = 0,
    bool IsOutOfBusinessHours = false,
    int? MaxDailyMessagesPerUser = null,
    IReadOnlyList<ScheduleRuleTimeWindowRequest>? Windows = null,
    string AudienceMode = "RegisteredContacts",
    int? ExcludedTurmaId = null);

public record ScheduleRuleResponse(
    int Id,
    string Name,
    string StartTime,
    string EndTime,
    IReadOnlyList<ScheduleRuleMessageResponse> Messages,
    bool IsEnabled,
    int ThrottleMinutes,
    bool IsOutOfBusinessHours,
    int? MaxDailyMessagesPerUser,
    DateTime CreatedAtUtc,
    IReadOnlyList<ScheduleRuleTimeWindowResponse> Windows,
    string AudienceMode,
    int? ExcludedTurmaId,
    string? ExcludedTurmaName);
