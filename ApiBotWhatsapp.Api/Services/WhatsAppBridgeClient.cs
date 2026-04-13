using System.Net.Http.Json;
using ApiBotWhatsapp.Api.Dtos;

namespace ApiBotWhatsapp.Api.Services;

public class WhatsAppBridgeClient(IConfiguration configuration, IHttpClientFactory httpClientFactory)
{
    private readonly HttpClient _client = httpClientFactory.CreateClient(nameof(WhatsAppBridgeClient));

    private string? BaseUrl => configuration["WhatsApp:BridgeBaseUrl"];

    public async Task<WhatsAppConnectionStatusResponse?> GetStatusAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

        try
        {
            return await _client.GetFromJsonAsync<WhatsAppConnectionStatusResponse>(
                $"{BaseUrl}/session/status",
                cancellationToken);
        }
        catch
        {
            return null;
        }
    }

    public async Task<string?> GetQrAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

        HttpResponseMessage response;
        try
        {
            response = await _client.GetAsync($"{BaseUrl}/session/qr", cancellationToken);
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

    public async Task<bool> ConnectAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return false;
        }

        try
        {
            var response = await _client.PostAsync($"{BaseUrl}/session/connect", null, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<bool> DisconnectAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return false;
        }

        try
        {
            var response = await _client.PostAsync($"{BaseUrl}/session/disconnect", null, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<string?> GetPairingCodeAsync(string phoneNumber, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(BaseUrl))
        {
            return null;
        }

        try
        {
            var response = await _client.PostAsJsonAsync(
                $"{BaseUrl}/session/pairing-code",
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

    public async Task<(bool Success, string Status)> SendMessageAsync(string phoneNumber, string message, bool markAsUnread, CancellationToken cancellationToken)
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
                new SendMessageRequest(phoneNumber, message, markAsUnread),
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
