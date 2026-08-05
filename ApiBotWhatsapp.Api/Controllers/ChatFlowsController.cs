using System.Text.Json;
using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Dtos;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Utils;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiBotWhatsapp.Api.Controllers;

[ApiController]
[Route("api/chat-flows")]
public class ChatFlowsController(AppDbContext dbContext) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static string SerializeKeywords(IEnumerable<string> keywords) =>
        JsonSerializer.Serialize(keywords.Select(k => k.Trim()).Where(k => k.Length > 0), JsonOptions);

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

    // Validates the whole nested payload (steps + options) before anything touches the
    // database: exactly one start step, every non-end step has at least one option, every
    // option has at least one keyword, and every NextStepClientId resolves to a step that's
    // actually present in this same request.
    private static bool TryValidateSteps(List<ChatFlowStepRequest>? steps, out string? error)
    {
        error = null;

        if (steps is not { Count: > 0 })
        {
            error = "At least one step is required.";
            return false;
        }

        var clientIds = new HashSet<string>();
        foreach (var step in steps)
        {
            if (string.IsNullOrWhiteSpace(step.ClientId))
            {
                error = "Every step needs a ClientId.";
                return false;
            }

            if (!clientIds.Add(step.ClientId))
            {
                error = $"Duplicate step ClientId: {step.ClientId}.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(step.MessageText))
            {
                error = "Every step must have a non-empty message.";
                return false;
            }
        }

        var startSteps = steps.Count(s => s.IsStartStep);
        if (startSteps != 1)
        {
            error = $"Exactly one step must be the start step (found {startSteps}).";
            return false;
        }

        foreach (var step in steps)
        {
            if (step.IsEndStep)
            {
                continue;
            }

            if (step.Options is not { Count: > 0 })
            {
                error = $"Step \"{step.Label ?? step.ClientId}\" is not an end step, so it needs at least one option.";
                return false;
            }

            foreach (var option in step.Options)
            {
                if (string.IsNullOrWhiteSpace(option.Label))
                {
                    error = "Every option must have a non-empty label.";
                    return false;
                }

                if (option.MatchKeywords is not { Count: > 0 } || option.MatchKeywords.All(string.IsNullOrWhiteSpace))
                {
                    error = $"Option \"{option.Label}\" needs at least one keyword.";
                    return false;
                }

                if (!clientIds.Contains(option.NextStepClientId))
                {
                    error = $"Option \"{option.Label}\" points to an unknown step (NextStepClientId={option.NextStepClientId}).";
                    return false;
                }
            }
        }

        return true;
    }

    // Wipes every step/option/in-progress conversation for this flow and reinserts the
    // submitted ones fresh — same "replace wholesale on save" simplicity as ScheduleRule's
    // Windows/Messages JSON, just over real relational rows instead of a JSON blob. Steps are
    // saved first so ClientId -> real Id can be resolved before options (which reference other
    // steps) are written.
    private async Task ReplaceStepsAsync(ChatFlow flow, List<ChatFlowStepRequest> steps, CancellationToken cancellationToken)
    {
        var oldOptions = await dbContext.ChatFlowOptions
            .Where(o => o.ChatFlowStep!.ChatFlowId == flow.Id)
            .ToListAsync(cancellationToken);
        dbContext.ChatFlowOptions.RemoveRange(oldOptions);

        var oldConversations = await dbContext.ChatFlowConversations
            .Where(c => c.ChatFlowId == flow.Id)
            .ToListAsync(cancellationToken);
        dbContext.ChatFlowConversations.RemoveRange(oldConversations);

        var oldSteps = await dbContext.ChatFlowSteps
            .Where(s => s.ChatFlowId == flow.Id)
            .ToListAsync(cancellationToken);
        dbContext.ChatFlowSteps.RemoveRange(oldSteps);

        await dbContext.SaveChangesAsync(cancellationToken);

        var newSteps = steps.Select(s => new ChatFlowStep
        {
            ChatFlowId = flow.Id,
            Label = s.Label?.Trim(),
            MessageText = s.MessageText.Trim(),
            IsStartStep = s.IsStartStep,
            IsEndStep = s.IsEndStep,
            InvalidAnswerMessage = string.IsNullOrWhiteSpace(s.InvalidAnswerMessage) ? null : s.InvalidAnswerMessage.Trim(),
        }).ToList();

        dbContext.ChatFlowSteps.AddRange(newSteps);
        await dbContext.SaveChangesAsync(cancellationToken);

        var clientIdToRealId = steps.Zip(newSteps, (req, entity) => (req.ClientId, entity.Id))
            .ToDictionary(pair => pair.ClientId, pair => pair.Id);

        var newOptions = steps.Zip(newSteps, (req, entity) => (req, entity))
            .SelectMany(pair => pair.req.Options.Select(o => new ChatFlowOption
            {
                ChatFlowStepId = pair.entity.Id,
                Label = o.Label.Trim(),
                MatchKeywordsJson = SerializeKeywords(o.MatchKeywords),
                NextStepId = clientIdToRealId[o.NextStepClientId],
            }))
            .ToList();

        dbContext.ChatFlowOptions.AddRange(newOptions);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ChatFlowListItemResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var flows = await dbContext.ChatFlows
            .Where(f => f.OwnerUserId == ownerUserId)
            .OrderByDescending(f => f.CreatedAtUtc)
            .Select(f => new ChatFlowListItemResponse(f.Id, f.Name, f.Steps.Count, f.CreatedAtUtc))
            .ToListAsync(cancellationToken);

        return Ok(flows);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ChatFlowResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var flow = await dbContext.ChatFlows
            .Include(f => f.Steps).ThenInclude(s => s.Options)
            .FirstOrDefaultAsync(f => f.Id == id && f.OwnerUserId == ownerUserId, cancellationToken);

        if (flow is null) return NotFound();

        return Ok(ToResponse(flow));
    }

    [HttpPost]
    public async Task<ActionResult<ChatFlowResponse>> Create([FromBody] ChatFlowRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (!TryValidateSteps(request.Steps, out var error))
        {
            return BadRequest(error);
        }

        var flow = new ChatFlow
        {
            OwnerUserId = ownerUserId,
            Name = request.Name.Trim(),
            TimeoutMinutes = request.TimeoutMinutes > 0 ? request.TimeoutMinutes : 1440,
            TimeoutMessage = string.IsNullOrWhiteSpace(request.TimeoutMessage) ? null : request.TimeoutMessage.Trim(),
        };

        dbContext.ChatFlows.Add(flow);
        await dbContext.SaveChangesAsync(cancellationToken);

        await ReplaceStepsAsync(flow, request.Steps, cancellationToken);

        var saved = await dbContext.ChatFlows
            .Include(f => f.Steps).ThenInclude(s => s.Options)
            .FirstAsync(f => f.Id == flow.Id, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = flow.Id }, ToResponse(saved));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ChatFlowResponse>> Update(int id, [FromBody] ChatFlowRequest request, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var flow = await dbContext.ChatFlows.FirstOrDefaultAsync(f => f.Id == id && f.OwnerUserId == ownerUserId, cancellationToken);
        if (flow is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (!TryValidateSteps(request.Steps, out var error))
        {
            return BadRequest(error);
        }

        flow.Name = request.Name.Trim();
        flow.TimeoutMinutes = request.TimeoutMinutes > 0 ? request.TimeoutMinutes : 1440;
        flow.TimeoutMessage = string.IsNullOrWhiteSpace(request.TimeoutMessage) ? null : request.TimeoutMessage.Trim();
        await dbContext.SaveChangesAsync(cancellationToken);

        await ReplaceStepsAsync(flow, request.Steps, cancellationToken);

        var saved = await dbContext.ChatFlows
            .Include(f => f.Steps).ThenInclude(s => s.Options)
            .FirstAsync(f => f.Id == flow.Id, cancellationToken);

        return Ok(ToResponse(saved));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var ownerUserId = this.GetCurrentUserId();

        var flow = await dbContext.ChatFlows.FirstOrDefaultAsync(f => f.Id == id && f.OwnerUserId == ownerUserId, cancellationToken);
        if (flow is null) return NotFound();

        // MessagesJson is a free-form JSON column (no real FK), so deleting a flow that's still
        // referenced there would leave a dangling ChatFlowId on some rule's message — block it
        // instead, same pattern as PaisesController.Delete.
        var rules = await dbContext.ScheduleRules
            .Where(rule => rule.OwnerUserId == ownerUserId)
            .ToListAsync(cancellationToken);

        var inUse = rules.Any(rule =>
        {
            try
            {
                var messages = JsonSerializer.Deserialize<List<ScheduleRuleMessageRequest>>(rule.MessagesJson, JsonOptions);
                return messages?.Any(m => m.ChatFlowId == id) ?? false;
            }
            catch
            {
                return false;
            }
        });

        if (inUse)
        {
            return BadRequest("Não é possível excluir: há mensagens de regras vinculadas a este fluxo. Reatribua ou remova essas mensagens antes de excluir.");
        }

        // Same safe order as ReplaceStepsAsync's wipe: options/conversations/steps before the
        // flow itself, so the NextStepId/CurrentStepId Restrict FKs never get in the way.
        await ReplaceStepsAsync(flow, [], cancellationToken);

        dbContext.ChatFlows.Remove(flow);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static ChatFlowResponse ToResponse(ChatFlow flow) => new(
        flow.Id,
        flow.Name,
        flow.TimeoutMinutes,
        flow.TimeoutMessage,
        flow.CreatedAtUtc,
        flow.Steps.Select(s => new ChatFlowStepResponse(
            s.Id,
            s.Label,
            s.MessageText,
            s.IsStartStep,
            s.IsEndStep,
            s.InvalidAnswerMessage,
            s.Options.Select(o => new ChatFlowOptionResponse(
                o.Id,
                o.Label,
                DeserializeKeywords(o.MatchKeywordsJson),
                o.NextStepId)).ToList()
        )).ToList());
}
