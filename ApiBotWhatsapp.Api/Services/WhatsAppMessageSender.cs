using System.Net.Http.Json;
using ApiBotWhatsapp.Api.Utils;

namespace ApiBotWhatsapp.Api.Services;

public class WhatsAppMessageSender(IConfiguration configuration, IHttpClientFactory httpClientFactory, WhatsAppBridgeClient bridgeClient)
{

    public async Task<(bool Success, string Status)> SendMessageAsync(string phoneNumber, string message, bool markAsUnread, string? sourceWhatsAppNumber, CancellationToken cancellationToken)
    {
        var candidates = PhoneNumberUtils.GetEquivalentBrazilianNumbers(phoneNumber);
        if (candidates.Length == 0)
        {
            return (false, "Phone number is invalid.");
        }

        var bridgeBaseUrl = configuration["WhatsApp:BridgeBaseUrl"];
        if (!string.IsNullOrWhiteSpace(bridgeBaseUrl))
        {
            foreach (var candidate in candidates)
            {
                var result = await bridgeClient.SendMessageAsync(candidate, message, markAsUnread, sourceWhatsAppNumber, cancellationToken);
                if (result.Success)
                {
                    return result;
                }

                if (candidate == candidates[^1])
                {
                    return result;
                }
            }
        }

        var outgoingWebhookUrl = configuration["WhatsApp:OutgoingWebhookUrl"];
        if (string.IsNullOrWhiteSpace(outgoingWebhookUrl))
        {
            return (true, "Simulated send (configure WhatsApp:OutgoingWebhookUrl for real dispatch).");
        }

        foreach (var candidate in candidates)
        {
            var payload = new
            {
                phoneNumber = candidate,
                message,
                markAsUnread,
                sourceWhatsAppNumber
            };

            try
            {
                var client = httpClientFactory.CreateClient();
                var response = await client.PostAsJsonAsync(outgoingWebhookUrl, payload, cancellationToken);

                if (response.IsSuccessStatusCode)
                {
                    return (true, "Sent to WhatsApp provider.");
                }

                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                if (candidate == candidates[^1])
                {
                    return (false, string.IsNullOrWhiteSpace(body) ? $"Provider returned {(int)response.StatusCode}." : body);
                }
            }
            catch (Exception ex)
            {
                if (candidate == candidates[^1])
                {
                    return (false, $"Provider call failed: {ex.Message}");
                }
            }
        }

        return (false, "Unable to send message using available phone variants.");
    }
}
