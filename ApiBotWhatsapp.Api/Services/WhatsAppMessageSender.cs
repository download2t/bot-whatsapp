using System.Net.Http.Json;

namespace ApiBotWhatsapp.Api.Services;

public class WhatsAppMessageSender(IConfiguration configuration, IHttpClientFactory httpClientFactory, WhatsAppBridgeClient bridgeClient)
{

    public async Task<(bool Success, string Status)> SendMessageAsync(string phoneNumber, string message, bool markAsUnread, CancellationToken cancellationToken)
    {
        var bridgeBaseUrl = configuration["WhatsApp:BridgeBaseUrl"];
        if (!string.IsNullOrWhiteSpace(bridgeBaseUrl))
        {
            return await bridgeClient.SendMessageAsync(phoneNumber, message, markAsUnread, cancellationToken);
        }

        var outgoingWebhookUrl = configuration["WhatsApp:OutgoingWebhookUrl"];
        if (string.IsNullOrWhiteSpace(outgoingWebhookUrl))
        {
            return (true, "Simulated send (configure WhatsApp:OutgoingWebhookUrl for real dispatch).");
        }

        var payload = new
        {
            phoneNumber,
            message,
            markAsUnread
        };

        try
        {
            var client = httpClientFactory.CreateClient();
            var response = await client.PostAsJsonAsync(outgoingWebhookUrl, payload, cancellationToken);

            return response.IsSuccessStatusCode
                ? (true, "Sent to WhatsApp provider.")
                : (false, $"Provider returned {(int)response.StatusCode}.");
        }
        catch (Exception ex)
        {
            return (false, $"Provider call failed: {ex.Message}");
        }
    }
}
