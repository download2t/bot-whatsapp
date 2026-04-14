namespace ApiBotWhatsapp.Api.Dtos;

public record MessageLogResponse(
    int Id,
    int CompanyId,
    string WhatsAppNumber,
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

public record WhatsAppFilterOptionsResponse(IReadOnlyList<string> Numbers, string? FixedNumber);
