using System.Collections.Concurrent;
using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Services;

// Runs a bulk-send campaign to completion independent of the HTTP request that started it, so
// closing the browser tab (or losing connectivity) doesn't kill an in-flight campaign and doesn't
// lose the per-recipient audit trail. Registered as a singleton; opens its own DI scope per
// campaign run since the request's own scoped AppDbContext/WhatsAppMessageSender don't outlive
// the request.
public class BulkCampaignRunner(IServiceScopeFactory scopeFactory)
{
    private readonly ConcurrentDictionary<int, CancellationTokenSource> _running = new();

    // Mirrors BulkMessagesController's old abort heuristic: stop the whole campaign instead of
    // burning through every remaining recipient when WhatsApp itself signals the session/account
    // is the problem (blocked, disconnected, rate-limited), not just a bad recipient.
    private static bool ShouldAbortBulk(string status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return false;
        }

        var normalized = status.ToLowerInvariant();
        return normalized.Contains("block")
            || normalized.Contains("bloque")
            || normalized.Contains("ban")
            || normalized.Contains("forbidden")
            || normalized.Contains("unauthorized")
            || normalized.Contains("not connected")
            || normalized.Contains("disconnected")
            || normalized.Contains("session")
            || normalized.Contains("rate limit")
            || normalized.Contains("429")
            || normalized.Contains("403")
            || normalized.Contains("401");
    }

    public void Start(int campaignId, string? mediaBase64)
    {
        var cts = new CancellationTokenSource();
        if (!_running.TryAdd(campaignId, cts))
        {
            return;
        }

        _ = Task.Run(() => ExecuteAsync(campaignId, mediaBase64, cts.Token));
    }

    public bool TryCancel(int campaignId)
    {
        if (_running.TryGetValue(campaignId, out var cts))
        {
            cts.Cancel();
            return true;
        }

        return false;
    }

    private async Task ExecuteAsync(int campaignId, string? mediaBase64, CancellationToken token)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var sender = scope.ServiceProvider.GetRequiredService<WhatsAppMessageSender>();

            var campaign = await dbContext.BulkCampaigns.FirstOrDefaultAsync(c => c.Id == campaignId);
            if (campaign is null)
            {
                return;
            }

            var senderSessionId = $"user-{campaign.OwnerUserId}";
            var items = await dbContext.BulkCampaignItems
                .Where(i => i.BulkCampaignId == campaignId && i.Status == "Pending")
                .OrderBy(i => i.Id)
                .ToListAsync();

            var cancelled = false;
            var aborted = false;

            for (var index = 0; index < items.Count; index++)
            {
                if (token.IsCancellationRequested)
                {
                    cancelled = true;
                    break;
                }

                var item = items[index];
                item.Status = "Sending";
                await dbContext.SaveChangesAsync();

                var personalized = $"{campaign.Greeting} {item.ContactName}!\n{campaign.MessageTemplate}";
                var normalizedPhone = PhoneNumberUtils.Normalize(item.PhoneNumber);

                (bool Success, string Status, string? MessageId, bool UnreadApplied) result;
                try
                {
                    // Intentionally CancellationToken.None: once a send is in flight we let it
                    // finish rather than aborting the HTTP call to the bridge mid-flight, which
                    // could leave a message actually delivered but recorded as cancelled/failed.
                    result = await sender.SendMessageAsync(
                        normalizedPhone,
                        personalized,
                        campaign.MarkAsUnread,
                        senderSessionId,
                        CancellationToken.None,
                        mediaBase64,
                        campaign.MediaMimeType,
                        campaign.MediaFileName);
                }
                catch (Exception ex)
                {
                    result = (false, $"Erro interno: {ex.Message}", null, false);
                }

                item.Status = result.Success ? "Sent" : "Failed";
                item.StatusDetail = result.Status;
                item.MessageId = result.MessageId;
                item.ProcessedAtUtc = DateTime.UtcNow;

                if (result.Success)
                {
                    campaign.SentCount++;

                    // Same reasoning as the individual send endpoint: a manual message to this
                    // contact means a human is now handling it, so drop any in-progress chat-flow
                    // conversation instead of leaving it to misinterpret whatever they say next.
                    var activeConversation = await dbContext.ChatFlowConversations
                        .FirstOrDefaultAsync(c => c.OwnerUserId == campaign.OwnerUserId && c.PhoneNumber == normalizedPhone);
                    if (activeConversation is not null)
                    {
                        dbContext.ChatFlowConversations.Remove(activeConversation);
                    }
                }
                else
                {
                    campaign.FailedCount++;
                }

                await dbContext.SaveChangesAsync();

                if (!result.Success && ShouldAbortBulk(result.Status))
                {
                    aborted = true;
                    campaign.AbortReason = result.Status;
                    break;
                }

                if (index < items.Count - 1)
                {
                    try
                    {
                        await Task.Delay(TimeSpan.FromSeconds(campaign.IntervalSeconds), token);
                    }
                    catch (OperationCanceledException)
                    {
                        cancelled = true;
                        break;
                    }
                }
            }

            if (cancelled || aborted)
            {
                var remaining = await dbContext.BulkCampaignItems
                    .Where(i => i.BulkCampaignId == campaignId && i.Status == "Pending")
                    .ToListAsync();

                foreach (var pending in remaining)
                {
                    pending.Status = "Cancelled";
                    pending.StatusDetail = aborted
                        ? campaign.AbortReason ?? "Envio interrompido."
                        : "Cancelado pelo usuário.";
                    pending.ProcessedAtUtc = DateTime.UtcNow;
                }
            }

            campaign.Status = aborted ? "Aborted" : cancelled ? "Cancelled" : "Completed";
            campaign.FinishedAtUtc = DateTime.UtcNow;
            await dbContext.SaveChangesAsync();
        }
        finally
        {
            _running.TryRemove(campaignId, out _);
        }
    }
}
