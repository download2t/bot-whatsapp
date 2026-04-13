namespace ApiBotWhatsapp.Api.Dtos;

public record WhitelistRequest(string PhoneNumber, string? Name);

public record WhitelistResponse(int Id, string? Name, string PhoneNumber, DateTime CreatedAtUtc);
