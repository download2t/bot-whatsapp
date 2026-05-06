namespace ApiBotWhatsapp.Api.Dtos;

public record TurmaRequest(string Name, bool IsActive = true);
public record TurmaResponse(int Id, string Name, bool IsActive);

public record ContatoRequest(string Name, string PhoneNumber, int? TurmaId, bool IsActive = true);
public record ContatoResponse(int Id, string Name, string PhoneNumber, int? TurmaId, bool IsActive);

public record BulkSendRequest(int TurmaId, List<int> ContactIds, string Greeting, string Message, bool MarkAsUnread = false, string? SourceWhatsAppNumber = null);
public record BulkSendResult(int ContactId, string PhoneNumber, bool Success, string Status);
