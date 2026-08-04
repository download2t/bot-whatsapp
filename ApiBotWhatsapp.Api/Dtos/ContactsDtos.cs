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
	string? MediaBase64 = null,
	string? MediaMimeType = null,
	string? MediaFileName = null);

public record BulkCampaignItemResponse(
	int Id,
	int ContactId,
	string ContactName,
	string PhoneNumber,
	string Status,
	string? StatusDetail,
	DateTime? ProcessedAtUtc);

public record BulkCampaignResponse(
	int Id,
	string Greeting,
	string MessageTemplate,
	int IntervalSeconds,
	string? MediaUrl,
	string? MediaMimeType,
	string? MediaFileName,
	string Status,
	string? AbortReason,
	int TotalCount,
	int SentCount,
	int FailedCount,
	DateTime CreatedAtUtc,
	DateTime? FinishedAtUtc,
	List<BulkCampaignItemResponse> Items);

public record BulkCampaignListItemResponse(
	int Id,
	string MessageTemplate,
	string Status,
	int TotalCount,
	int SentCount,
	int FailedCount,
	DateTime CreatedAtUtc,
	DateTime? FinishedAtUtc);
