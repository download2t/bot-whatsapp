namespace ApiBotWhatsapp.Api.Dtos;

public record LoginRequest(string Username, string Password);

public record RegisterRequest(string Username, string Password);

public record LoginResponse(
	string Token,
	DateTime ExpiresAtUtc,
	string Username,
	bool IsAdmin,
	string? UserTitle);

public record UserProfileResponse(int Id, string Username, bool IsAdmin, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes, DateTime? CreatedAtUtc);

public record UpdateProfileRequest(string Username, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record CreateUserRequest(string Username, string Password, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes, bool? IsAdmin);

public record UpdateUserRequest(string Username, string? Email, string? Phone, string? Cpf, string? FullName, string? Title, string? Notes, bool? IsAdmin);

public record UserListResponse(int Id, string Username, bool IsAdmin, string? Email, string? Phone, string? FullName, DateTime? CreatedAtUtc);
