namespace ApiBotWhatsapp.Api.Dtos;

public record MessageLogResponse(
    int Id,
    string WhatsAppNumber,
    string Direction,
    string PhoneNumber,
    string? ContactName, // <--- Adicionado
    string Content,
    bool IsAutomatic,
    string Status,
    DateTime TimestampUtc,
    string? MediaUrl = null,
    string? MediaMimeType = null,
    string? MediaFileName = null,
    string? AckStatus = null);
    

// Os outros records permanecem inalterados
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

public record MarkConversationReadRequest(string PhoneNumber);