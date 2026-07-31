using System.ComponentModel.DataAnnotations;

namespace ApiBotWhatsapp.Api.Models;

public class MessageLog
{
    public int Id { get; set; }

    public int OwnerUserId { get; set; }

    [MaxLength(20)]
    public string WhatsAppNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Direction { get; set; } = "Incoming";

    [Required]
    [MaxLength(20)]
    public string PhoneNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(4000)]
    public string Content { get; set; } = string.Empty;

    public string? ContactName { get; set; }
    public bool IsAutomatic { get; set; }

    // WhatsApp's own message id (message.id._serialized from the bridge). Used to make
    // incoming-message processing idempotent when whatsapp-web.js re-emits the same
    // message_create event (e.g. after a session reconnect/resync).
    [MaxLength(150)]
    public string? MessageId { get; set; }

    [MaxLength(120)]
    public string Status { get; set; } = "Received";

    // Relative URL under wwwroot (e.g. "/uploads/1/xxxx.jpg") for the image/video/document
    // attached to this message, if any.
    [MaxLength(300)]
    public string? MediaUrl { get; set; }

    [MaxLength(150)]
    public string? MediaMimeType { get; set; }

    [MaxLength(255)]
    public string? MediaFileName { get; set; }

    // WhatsApp's own delivery status for outgoing messages, updated later via the bridge's
    // message_ack event: "sent" | "delivered" | "read" | "played" | "error". Null until the
    // first ack arrives, and never set for incoming messages.
    [MaxLength(20)]
    public string? AckStatus { get; set; }

    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
}
