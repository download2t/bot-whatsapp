using System.Text.Json;
using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Services;

// The conversation engine for chat flows. A flow is triggered explicitly by a matched
// ScheduleRule message that has ChatFlowId set (see AutoReplyService.ProcessIncomingMessageAsync)
// — this service itself doesn't decide *when* a flow should start, only how one runs once
// started, and how an already-in-progress conversation continues on the contact's next reply
// (which always takes priority over re-evaluating rules, regardless of what today's message
// would otherwise be).
public class ChatFlowService(
    AppDbContext dbContext,
    WhatsAppMessageSender messageSender,
    ConversationInboxService conversationInbox,
    ILogger<ChatFlowService> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private const string DefaultInvalidAnswerMessage = "Não entendi sua resposta. Por favor, escolha uma das opções.";
    private const string DefaultTimeoutMessage = "Atendimento encerrado por inatividade. Se precisar de algo, é só mandar outra mensagem que a gente começa de novo. 😊";

    // Null means "no conversation in progress for this contact" — caller should proceed with
    // its own normal message-selection logic instead.
    public async Task<WhatsAppWebhookResponse?> TryContinueAsync(
        int ownerUserId,
        string normalizedPhone,
        string incomingMessage,
        string normalizedWhatsApp,
        DateTime brasiliaTime,
        CancellationToken cancellationToken)
    {
        var conversation = await dbContext.ChatFlowConversations
            .FirstOrDefaultAsync(c => c.OwnerUserId == ownerUserId && c.PhoneNumber == normalizedPhone, cancellationToken);

        if (conversation is null)
        {
            return null;
        }

        var flow = await dbContext.ChatFlows.FirstOrDefaultAsync(f => f.Id == conversation.ChatFlowId, cancellationToken);

        if (flow is null)
        {
            // The flow itself no longer exists (shouldn't happen — ChatFlowsController blocks
            // deleting a flow still referenced by a rule message — but a stray conversation
            // could theoretically outlive it). Nothing sensible to send, just clean up quietly.
            logger.LogInformation(
                "ChatFlow: conversation for OwnerUserId={OwnerUserId} Phone={Phone} references a flow that no longer exists — resetting.",
                ownerUserId, normalizedPhone);
            dbContext.ChatFlowConversations.Remove(conversation);
            await dbContext.SaveChangesAsync(cancellationToken);
            return null;
        }

        var timedOut = brasiliaTime - conversation.LastMessageAtUtc > TimeSpan.FromMinutes(flow.TimeoutMinutes);

        if (timedOut)
        {
            logger.LogInformation(
                "ChatFlow: conversation for OwnerUserId={OwnerUserId} Phone={Phone} expired after {Minutes} minutes of inactivity — closing with a timeout message.",
                ownerUserId, normalizedPhone, flow.TimeoutMinutes);
            dbContext.ChatFlowConversations.Remove(conversation);
            await dbContext.SaveChangesAsync(cancellationToken);

            var timeoutMessage = string.IsNullOrWhiteSpace(flow.TimeoutMessage) ? DefaultTimeoutMessage : flow.TimeoutMessage;
            return await SendStepMessageAsync(timeoutMessage, ownerUserId, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
        }

        return await AdvanceConversationAsync(conversation, incomingMessage, ownerUserId, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
    }

    // Called by AutoReplyService when today's matched ScheduleRule message has ChatFlowId set —
    // starts a brand new conversation for that specific flow (there is no more "the active
    // flow"; every trigger names its flow explicitly).
    public async Task<WhatsAppWebhookResponse> StartConversationAsync(
        int chatFlowId,
        int ownerUserId,
        string normalizedPhone,
        string normalizedWhatsApp,
        DateTime brasiliaTime,
        CancellationToken cancellationToken)
    {
        var flow = await dbContext.ChatFlows
            .Include(f => f.Steps).ThenInclude(s => s.Options)
            .FirstOrDefaultAsync(f => f.Id == chatFlowId && f.OwnerUserId == ownerUserId, cancellationToken);

        if (flow is null)
        {
            // Shouldn't happen in practice — ChatFlowsController.Delete blocks removing a flow
            // still referenced by a rule message — but a rule could reference a flow from
            // another owner via a bad payload, or the block could be bypassed some other way.
            logger.LogWarning("ChatFlow {ChatFlowId} referenced by a rule message not found for OwnerUserId={OwnerUserId}.", chatFlowId, ownerUserId);
            return new WhatsAppWebhookResponse(false, "Configured chat flow not found.", null);
        }

        var startStep = flow.Steps.FirstOrDefault(s => s.IsStartStep);
        if (startStep is null)
        {
            logger.LogWarning("ChatFlow {ChatFlowId} has no start step — nothing to send.", flow.Id);
            return new WhatsAppWebhookResponse(false, "Configured chat flow has no start step.", null);
        }

        // A start step that's also an end step is a degenerate one-message flow — nothing to
        // wait for, so no conversation state gets persisted at all.
        if (!startStep.IsEndStep)
        {
            dbContext.ChatFlowConversations.Add(new ChatFlowConversation
            {
                OwnerUserId = ownerUserId,
                PhoneNumber = normalizedPhone,
                ChatFlowId = flow.Id,
                CurrentStepId = startStep.Id,
                StartedAtUtc = brasiliaTime,
                LastMessageAtUtc = brasiliaTime,
            });
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return await SendStepMessageAsync(startStep.MessageText, ownerUserId, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
    }

    private async Task<WhatsAppWebhookResponse> AdvanceConversationAsync(
        ChatFlowConversation conversation,
        string incomingMessage,
        int ownerUserId,
        string normalizedPhone,
        string normalizedWhatsApp,
        DateTime brasiliaTime,
        CancellationToken cancellationToken)
    {
        var currentStep = await dbContext.ChatFlowSteps
            .Include(s => s.Options)
            .FirstAsync(s => s.Id == conversation.CurrentStepId, cancellationToken);

        var trimmedReply = incomingMessage.Trim();
        ChatFlowOption? matchedOption = null;
        foreach (var option in currentStep.Options)
        {
            var keywords = DeserializeKeywords(option.MatchKeywordsJson);
            if (keywords.Any(keyword => string.Equals(keyword, trimmedReply, StringComparison.OrdinalIgnoreCase)))
            {
                matchedOption = option;
                break;
            }
        }

        conversation.LastMessageAtUtc = brasiliaTime;

        if (matchedOption is null)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            var invalidMessage = currentStep.InvalidAnswerMessage ?? DefaultInvalidAnswerMessage;
            return await SendStepMessageAsync(invalidMessage, ownerUserId, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
        }

        var nextStep = await dbContext.ChatFlowSteps.FirstAsync(s => s.Id == matchedOption.NextStepId, cancellationToken);

        if (nextStep.IsEndStep)
        {
            dbContext.ChatFlowConversations.Remove(conversation);
        }
        else
        {
            conversation.CurrentStepId = nextStep.Id;
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        return await SendStepMessageAsync(nextStep.MessageText, ownerUserId, normalizedPhone, normalizedWhatsApp, brasiliaTime, cancellationToken);
    }

    // Mirrors how AutoReplyService sends+logs its own automatic replies, so /messages shows
    // flow-driven conversations exactly like schedule-rule ones — same sender, same
    // MessageLog shape, same "IsAutomatic" flag.
    private async Task<WhatsAppWebhookResponse> SendStepMessageAsync(
        string messageText,
        int ownerUserId,
        string normalizedPhone,
        string normalizedWhatsApp,
        DateTime brasiliaTime,
        CancellationToken cancellationToken)
    {
        var dispatchResult = await messageSender.SendMessageAsync(normalizedPhone, messageText, true, $"user-{ownerUserId}", cancellationToken);
        logger.LogInformation(
            "ChatFlow: sent step message to OwnerUserId={OwnerUserId} Phone={Phone} — Success={Success} UnreadApplied={UnreadApplied}.",
            ownerUserId, normalizedPhone, dispatchResult.Success, dispatchResult.UnreadApplied);

        dbContext.MessageLogs.Add(new MessageLog
        {
            OwnerUserId = ownerUserId,
            WhatsAppNumber = normalizedWhatsApp,
            Direction = "Outgoing",
            PhoneNumber = normalizedPhone,
            Content = messageText,
            IsAutomatic = true,
            Status = dispatchResult.Status,
            MessageId = dispatchResult.MessageId,
            TimestampUtc = brasiliaTime,
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        await conversationInbox.MarkPendingReviewAsync(ownerUserId, normalizedPhone, cancellationToken);

        return new WhatsAppWebhookResponse(dispatchResult.Success, dispatchResult.Status, messageText);
    }

    private static List<string> DeserializeKeywords(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
