namespace ApiBotWhatsapp.Api.Dtos;

public record WhatsAppWebhookRequest(
    string PhoneNumber,
    string? ContactName,
    string Message, 
    string? CompanyCode, 
    string? WhatsAppNumber, 
    DateTime? MessageTimestampUtc,
    string? Direction 
);

public record WhatsAppWebhookResponse(
    bool AutoReplySent, 
    string Status, 
    string? ReplyMessage
);