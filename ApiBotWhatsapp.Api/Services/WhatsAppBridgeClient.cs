using System.Net.Http.Json;
using ApiBotWhatsapp.Api.Dtos;

namespace ApiBotWhatsapp.Api.Services;

public class WhatsAppBridgeClient(IConfiguration configuration, IHttpClientFactory httpClientFactory)
{
    private readonly HttpClient _client = httpClientFactory.CreateClient(nameof(WhatsAppBridgeClient));

    private string BaseUrl
    {
        get
        {
            var configured = configuration["WhatsApp:BridgeBaseUrl"];
            var baseUrl = string.IsNullOrWhiteSpace(configured)
                ? "http://localhost:3001"
                : configured;

            return baseUrl.TrimEnd('/');
        }
    }

    public async Task<IReadOnlyList<WhatsAppConnectionItemResponse>> GetConnectionsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var result = await _client.GetFromJsonAsync<List<WhatsAppConnectionItemResponse>>(
                $"{BaseUrl}/session/list",
                cancellationToken);
            return result ?? [];
        }
        catch
        {
            return [];
        }
    }

    /// <summary>
    /// Status of one specific session (a single user's own WhatsApp connection), never any other
    /// connected session. Returns a "not connected" status if that session doesn't exist yet.
    /// </summary>
    public async Task<WhatsAppConnectionStatusResponse> GetSessionStatusAsync(string sessionId, CancellationToken cancellationToken)
    {
        var connections = await GetConnectionsAsync(cancellationToken);
        var mine = connections.FirstOrDefault(item => item.Id == sessionId);

        if (mine is null)
        {
            return new WhatsAppConnectionStatusResponse("not-connected", false, false, true, null, null);
        }

        return new WhatsAppConnectionStatusResponse(mine.Status, mine.IsConnected, mine.HasQr, true, mine.PhoneNumber, mine.LastError);
    }

    public async Task<string?> GetQrAsync(string? sessionId, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            var sessionPath = string.IsNullOrWhiteSpace(sessionId)
                ? "default"
                : Uri.EscapeDataString(sessionId);
            response = await _client.GetAsync($"{BaseUrl}/session/{sessionPath}/qr", cancellationToken);
        }
        catch
        {
            return null;
        }

        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        var payload = await response.Content.ReadFromJsonAsync<WhatsAppQrResponse>(cancellationToken: cancellationToken);
        return payload?.QrDataUrl;
    }

    public async Task<bool> ConnectAsync(string? sessionId, CancellationToken cancellationToken)
    {
        try
        {
            var sessionPath = string.IsNullOrWhiteSpace(sessionId)
                ? "default"
                : Uri.EscapeDataString(sessionId);
            var response = await _client.PostAsync($"{BaseUrl}/session/{sessionPath}/connect", null, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> DisconnectAsync(string? sessionId, CancellationToken cancellationToken)
    {
        try
        {
            var sessionPath = string.IsNullOrWhiteSpace(sessionId)
                ? "default"
                : Uri.EscapeDataString(sessionId);
            var response = await _client.PostAsync($"{BaseUrl}/session/{sessionPath}/disconnect", null, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<(string? PairingCode, string? Error)> GetPairingCodeAsync(string phoneNumber, string? sessionId, CancellationToken cancellationToken)
    {
        try
        {
            var sessionPath = string.IsNullOrWhiteSpace(sessionId)
                ? "default"
                : Uri.EscapeDataString(sessionId);
            var response = await _client.PostAsJsonAsync(
                $"{BaseUrl}/session/{sessionPath}/pairing-code",
                new { phoneNumber },
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                return (null, string.IsNullOrWhiteSpace(body) ? $"Bridge returned {(int)response.StatusCode}." : body);
            }

            var payload = await response.Content.ReadFromJsonAsync<WhatsAppPairingCodeResponse>(cancellationToken: cancellationToken);
            return (payload?.PairingCode, null);
        }
        catch (Exception ex)
        {
            return (null, $"Bridge unavailable: {ex.Message}");
        }
    }

    /// <summary>
    /// For each given phone number, asks the bridge what WhatsApp id (WID) it currently uses
    /// for that contact (could be "...@c.us" or "...@lid"). Used to match an incoming
    /// LID-addressed sender against registered Contatos by reverse lookup.
    /// </summary>
    public async Task<IReadOnlyList<ResolveWidItem>> ResolveWidsAsync(string sessionId, IReadOnlyList<string> phoneNumbers, CancellationToken cancellationToken)
    {
        if (phoneNumbers.Count == 0)
        {
            return [];
        }

        try
        {
            var sessionPath = Uri.EscapeDataString(sessionId);
            var response = await _client.PostAsJsonAsync(
                $"{BaseUrl}/session/{sessionPath}/resolve-wid",
                new { phoneNumbers },
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                return [];
            }

            var payload = await response.Content.ReadFromJsonAsync<List<ResolveWidItem>>(cancellationToken: cancellationToken);
            return payload ?? [];
        }
        catch
        {
            return [];
        }
    }

    public async Task<(bool Success, string Status, string? MessageId)> SendMessageAsync(
        string phoneNumber,
        string message,
        bool markAsUnread,
        string senderSessionId,
        CancellationToken cancellationToken,
        string? mediaBase64 = null,
        string? mediaMimeType = null,
        string? mediaFileName = null)
    {
        HttpResponseMessage response;
        try
        {
            response = await _client.PostAsJsonAsync(
                $"{BaseUrl}/messages/send",
                new
                {
                    phoneNumber,
                    message,
                    markAsUnread,
                    sessionId = senderSessionId,
                    mediaBase64,
                    mediaMimeType,
                    mediaFileName
                },
                cancellationToken);
        }
        catch (Exception ex)
        {
            return (false, $"Bridge unavailable: {ex.Message}", null);
        }

        if (response.IsSuccessStatusCode)
        {
            var payload = await response.Content.ReadFromJsonAsync<SendMessageBridgeResponse>(cancellationToken: cancellationToken);
            return (true, "Message sent through WhatsApp bridge.", payload?.MessageId);
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        return (false, string.IsNullOrWhiteSpace(body) ? $"Bridge returned {(int)response.StatusCode}." : body, null);
    }

    private record SendMessageBridgeResponse(bool Success, string? SessionId, string? SourceWhatsAppNumber, string? MessageId, bool UnreadApplied);
}
