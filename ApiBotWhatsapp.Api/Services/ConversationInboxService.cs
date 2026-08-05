using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Services;

// Tracks which conversations still need the operator's attention after the bot acted on them
// automatically. Separate from WhatsApp's own read receipts and from the bridge's "mark chat as
// unread" call (BulkCampaign.MarkAsUnread) — this is purely an internal flag for the /messages
// panel.
public class ConversationInboxService(AppDbContext dbContext)
{
    public async Task MarkPendingReviewAsync(int ownerUserId, string phoneNumber, CancellationToken cancellationToken)
    {
        var state = await dbContext.ConversationStates
            .FirstOrDefaultAsync(s => s.OwnerUserId == ownerUserId && s.PhoneNumber == phoneNumber, cancellationToken);

        if (state is null)
        {
            dbContext.ConversationStates.Add(new ConversationState
            {
                OwnerUserId = ownerUserId,
                PhoneNumber = phoneNumber,
                PendingReview = true,
                UpdatedAtUtc = DateTime.UtcNow,
            });
        }
        else
        {
            state.PendingReview = true;
            state.UpdatedAtUtc = DateTime.UtcNow;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkReadAsync(int ownerUserId, string phoneNumber, CancellationToken cancellationToken)
    {
        var state = await dbContext.ConversationStates
            .FirstOrDefaultAsync(s => s.OwnerUserId == ownerUserId && s.PhoneNumber == phoneNumber, cancellationToken);

        if (state is not null && state.PendingReview)
        {
            state.PendingReview = false;
            state.UpdatedAtUtc = DateTime.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<List<string>> GetPendingReviewPhonesAsync(int ownerUserId, CancellationToken cancellationToken)
    {
        return await dbContext.ConversationStates
            .Where(s => s.OwnerUserId == ownerUserId && s.PendingReview)
            .Select(s => s.PhoneNumber)
            .ToListAsync(cancellationToken);
    }
}
