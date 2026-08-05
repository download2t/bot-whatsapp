namespace ApiBotWhatsapp.Api.Dtos;

// ClientId/NextStepClientId: steps don't have real database ids yet when the whole flow is
// submitted in one request, so the client assigns its own arbitrary string id per step and
// options reference each other through that instead — the controller resolves ClientId ->
// real Id after inserting the steps. Existing steps just reuse their real id (as a string).
public record ChatFlowOptionRequest(string Label, List<string> MatchKeywords, string NextStepClientId);

public record ChatFlowStepRequest(
    string ClientId,
    string? Label,
    string MessageText,
    bool IsStartStep,
    bool IsEndStep,
    string? InvalidAnswerMessage,
    List<ChatFlowOptionRequest> Options);

public record ChatFlowRequest(string Name, int TimeoutMinutes, string? TimeoutMessage, List<ChatFlowStepRequest> Steps);

public record ChatFlowOptionResponse(int Id, string Label, List<string> MatchKeywords, int NextStepId);

public record ChatFlowStepResponse(
    int Id,
    string? Label,
    string MessageText,
    bool IsStartStep,
    bool IsEndStep,
    string? InvalidAnswerMessage,
    List<ChatFlowOptionResponse> Options);

public record ChatFlowResponse(
    int Id,
    string Name,
    int TimeoutMinutes,
    string? TimeoutMessage,
    DateTime CreatedAtUtc,
    List<ChatFlowStepResponse> Steps);

public record ChatFlowListItemResponse(int Id, string Name, int StepCount, DateTime CreatedAtUtc);
