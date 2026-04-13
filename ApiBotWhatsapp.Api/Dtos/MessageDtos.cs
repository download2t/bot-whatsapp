namespace ApiBotWhatsapp.Api.Dtos;

public record MessageLogResponse(
    int Id,
    string Direction,
    string PhoneNumber,
    string Content,
    bool IsAutomatic,
    string Status,
    DateTime TimestampUtc);

public record PagedMessageLogResponse(
    IReadOnlyList<MessageLogResponse> Items,
    int TotalCount,
    int Page,
    int PageSize);

public record DashboardStatusResponse(
    int TotalIncoming,
    int TotalOutgoing,
    int TotalAutomatic,
    int TodayIncoming,
    int TodayOutgoing,
    int TodayAutomatic);
