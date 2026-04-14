using System.Net.Http.Json;
using ApiBotWhatsapp.Api.Dtos;

namespace ApiBotWhatsapp.Api.Services;

public class WhatsAppBridgeClient(IConfiguration configuration, IHttpClientFactory httpClientFactory)
{
    private readonly HttpClient _client = httpClientFactory.CreateClient(nameof(WhatsAppBridgeClient));

    private string? BaseUrl => configuration["WhatsApp:BridgeBaseUrl"];

    public async Task<IReadOnlyList<WhatsAppConnectionItemResponse>> GetConnectionsAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return [];
        }

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

    public async Task<WhatsAppConnectionStatusResponse?> GetStatusAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

        try
        {
            var connections = await GetConnectionsAsync(cancellationToken);
            if (connections.Count > 0)
            {
                var selected = connections.FirstOrDefault(item => item.IsConnected)
                    ?? connections[0];

                return new WhatsAppConnectionStatusResponse(
                    selected.Status,
                    selected.IsConnected,
                    selected.HasQr,
                    true,
                    selected.PhoneNumber,
                    selected.LastError);
            }

            return await _client.GetFromJsonAsync<WhatsAppConnectionStatusResponse>(
                $"{BaseUrl}/session/status",
                cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    public async Task<string?> GetQrAsync(string? sessionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

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

    public async Task<string?> CreateConnectionAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

        try
        {
            var response = await _client.PostAsync($"{BaseUrl}/session/create", null, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var payload = await response.Content.ReadFromJsonAsync<WhatsAppCreateConnectionResponse>(cancellationToken: cancellationToken);
            return payload?.Id;
        }
        catch
        {
            return null;
        }
    }

    public async Task<bool> ConnectAsync(string? sessionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return false;
        }

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
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return false;
        }

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

    public async Task<string?> GetPairingCodeAsync(string phoneNumber, string? sessionId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

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
                return null;
            }

            var payload = await response.Content.ReadFromJsonAsync<WhatsAppPairingCodeResponse>(cancellationToken: cancellationToken);
            return payload?.PairingCode;
        }
        catch
        {
            return null;
        }
    }

    public async Task<(bool Success, string Status)> SendMessageAsync(string phoneNumber, string message, bool markAsUnread, string? sourceWhatsAppNumber, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return (false, "WhatsApp bridge is not configured.");
        }

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
                    sourceWhatsAppNumber
                },
                cancellationToken);
        }
        catch (Exception ex)
        {
            return (false, $"Bridge unavailable: {ex.Message}");
        }

        if (response.IsSuccessStatusCode)
        {
            return (true, "Message sent through WhatsApp bridge.");
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        return (false, string.IsNullOrWhiteSpace(body) ? $"Bridge returned {(int)response.StatusCode}." : body);
    }
}
