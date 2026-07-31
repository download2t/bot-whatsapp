namespace ApiBotWhatsapp.Api.Dtos;

public record WhatsAppWebhookRequest(
    string PhoneNumber,
    string? ContactName,
    string Message,
    string? WhatsAppNumber,
    DateTime? MessageTimestampUtc,
    string? Direction,
    string? MessageId = null,
    int? OwnerUserId = null,
    // The raw WhatsApp sender id (e.g. "...@lid" or "...@c.us") exactly as reported by the
    // bridge. Used to re-match a contact by reverse WID lookup when PhoneNumber turned out to
    // be a LID's digits instead of a real phone number.
    string? RawSenderId = null,
    string? MediaBase64 = null,
    string? MediaMimeType = null,
    string? MediaFileName = null
);

public record WhatsAppWebhookResponse(
    bool AutoReplySent,
    string Status,
    string? ReplyMessage
);

// Sent by the bridge whenever WhatsApp reports a delivery-status change (message_ack) for one
// of our outgoing messages: sent -> delivered -> read (and "played" for voice notes).
public record WhatsAppAckWebhookRequest(
    string MessageId,
    int? OwnerUserId,
    string AckStatus
);