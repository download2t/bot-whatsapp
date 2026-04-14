namespace ApiBotWhatsapp.Api.Dtos;

public record WhatsAppWebhookRequest(string PhoneNumber, string Message, string? CompanyCode, string? WhatsAppNumber);

public record WhatsAppWebhookResponse(bool AutoReplySent, string Status, string? ReplyMessage);
