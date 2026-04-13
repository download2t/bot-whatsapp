namespace ApiBotWhatsapp.Api.Dtos;

public record WhatsAppWebhookRequest(string PhoneNumber, string Message);

public record WhatsAppWebhookResponse(bool AutoReplySent, string Status, string? ReplyMessage);
