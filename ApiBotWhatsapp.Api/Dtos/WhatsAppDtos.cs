namespace ApiBotWhatsapp.Api.Dtos;

public record WhatsAppConnectionStatusResponse(
    string Status,
    bool IsConnected,
    bool HasQr,
    bool ApiAvailable,
    string? PhoneNumber,
    string? LastError);

public record WhatsAppQrResponse(string? QrDataUrl);

public record WhatsAppPairingCodeRequest(string PhoneNumber);

public record WhatsAppPairingCodeResponse(string? PairingCode);

public record WhatsAppConnectionItemResponse(
    string Id,
    string Status,
    bool IsConnected,
    bool HasQr,
    string? PhoneNumber,
    string? LastError);

public record WhatsAppCreateConnectionResponse(string Id, string Status);

public record SendMessageRequest(string PhoneNumber, string Message, bool MarkAsUnread = false);
