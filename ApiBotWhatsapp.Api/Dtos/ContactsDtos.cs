namespace ApiBotWhatsapp.Api.Dtos;

public record TurmaRequest(string Name, bool IsActive = true);
public record TurmaResponse(int Id, string Name, bool IsActive);

public record ContatoRequest(string Name, string PhoneNumber, int? TurmaId, bool IsActive = true);
public record ContatoResponse(int Id, string Name, string PhoneNumber, int? TurmaId, bool IsActive);

public record BulkSendRequest(
	int TurmaId,
	List<int> ContactIds,
	string Greeting,
	string Message,
	bool MarkAsUnread = false,
	int IntervalSeconds = 60,
	bool StreamUpdates = false,
	string? MediaBase64 = null,
	string? MediaMimeType = null,
	string? MediaFileName = null);
public record BulkSendResult(int ContactId, string PhoneNumber, bool Success, string Status);

public record BulkSendStreamEvent(
	string Type,
	int? ContactId,
	string? PhoneNumber,
	bool? Success,
	string? Status,
	int SentCount,
	int FailedCount,
	int RemainingCount,
	int TotalCount,
	bool Completed = false,
	bool Aborted = false,
	string? AbortReason = null);
