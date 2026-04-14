namespace ApiBotWhatsapp.Api.Dtos;

public record LoginRequest(string Username, string Password);

public record RegisterRequest(string Username, string Password);

public record CompanyOptionResponse(int CompanyId, string CompanyName, string CompanyCode, bool IsCurrent);

public record LoginResponse(
	string Token,
	DateTime ExpiresAtUtc,
	string Username,
	bool IsAdmin,
	string? UserTitle,
	int? CompanyId,
	string? CompanyName,
	string? CompanyCode,
	bool RequiresCompanySelection,
	IReadOnlyList<CompanyOptionResponse> Companies);

public record SelectCompanyRequest(int CompanyId);

public record UserProfileResponse(int Id, string Username, bool IsAdmin, int CompanyId, string CompanyName, string CompanyCode, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes, DateTime? CreatedAtUtc);

public record UpdateProfileRequest(string Username, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record CreateUserRequest(string Username, string Password, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes, bool? LinkToCurrentCompany, bool? IsAdmin);

public record UpdateUserRequest(string Username, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes, bool? IsAdmin);

public record UserListResponse(int Id, string Username, bool IsAdmin, int CompanyId, string CompanyName, string CompanyCode, string? Email, string? Phone, string? FullName, DateTime? CreatedAtUtc);

public record CompanyCreateRequest(string Name, string CompanyCode);

public record CompanyUpdateRequest(string Name, string CompanyCode);

public record CompanyListResponse(int Id, string Name, string CompanyCode, DateTime CreatedAtUtc, int UsersCount);

public record CompanyUserResponse(int UserId, string Username, bool IsAdmin, string? Email, string? FullName);

public record CompanyUserOptionResponse(int UserId, string Username, bool IsAdmin, string? Email, string? FullName, bool IsLinked);

public record LinkUserCompanyRequest(int UserId);
