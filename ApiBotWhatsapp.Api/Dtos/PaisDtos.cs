namespace ApiBotWhatsapp.Api.Dtos;

public record PaisRequest(string Name, string Ddi, bool IsActive = true);
public record PaisResponse(int Id, string Name, string Ddi, bool IsActive);
