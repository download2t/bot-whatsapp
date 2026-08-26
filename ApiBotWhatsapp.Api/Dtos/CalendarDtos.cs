namespace ApiBotWhatsapp.Api.Dtos;

public record CalendarPersonRequest(
    string Name,
    DateOnly? BirthDate,
    string? PhoneNumber,
    string? Email,
    string? Notes,
    bool IsActive);

public record CalendarPersonResponse(
    int Id,
    string Name,
    DateOnly? BirthDate,
    int? Age,
    string? PhoneNumber,
    string? Email,
    string? Notes,
    bool IsActive);

public record CalendarReminderRequest(
    string Title,
    string? Description,
    DateOnly Date,
    TimeSpan? Time,
    bool IsRecurringYearly,
    int? CalendarPersonId);

public record CalendarReminderResponse(
    int Id,
    string Title,
    string? Description,
    DateOnly Date,
    TimeSpan? Time,
    bool IsRecurringYearly,
    int? CalendarPersonId,
    string? CalendarPersonName);
