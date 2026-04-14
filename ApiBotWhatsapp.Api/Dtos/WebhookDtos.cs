namespace ApiBotWhatsapp.Api.Dtos;

public record WhatsAppWebhookRequest(string PhoneNumber, string Message, string? CompanyCode, string? WhatsAppNumber, DateTime? MessageTimestampUtc);

public record WhatsAppWebhookResponse(bool AutoReplySent, string Status, string? ReplyMessage);
