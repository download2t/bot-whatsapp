using System.Text;
using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Services;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

Env.Load();

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Api Bot WhatsApp",
        Version = "v1"
    });
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddHttpClient();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<AutoReplyService>();
builder.Services.AddScoped<WhatsAppMessageSender>();
builder.Services.AddScoped<WhatsAppBridgeClient>();
builder.Services.AddScoped<MediaStorageService>();
builder.Services.AddScoped<ChatFlowService>();
builder.Services.AddScoped<ConversationInboxService>();
builder.Services.AddSingleton<BulkCampaignRunner>();

var jwtSection = builder.Configuration.GetSection("Jwt");
var signingKey = jwtSection["SigningKey"]
    ?? throw new InvalidOperationException("Jwt:SigningKey must be configured.");
var keyBytes = Encoding.UTF8.GetBytes(signingKey);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidAudience = jwtSection["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", corsBuilder =>
    {
        corsBuilder
            .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"])
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbContext.Database.MigrateAsync();
    await SeedData.InitializeAsync(dbContext);

    // Any campaign still "Running" here means the process died mid-send (crash/restart/deploy):
    // there's no in-memory CancellationTokenSource for it anymore, so it can never be resumed or
    // cancelled through BulkCampaignRunner. Mark it Interrupted instead of leaving it stuck as
    // "Running" forever — its still-Pending items remain visible and can be retried.
    var interruptedCampaigns = await dbContext.BulkCampaigns
        .Where(c => c.Status == "Running")
        .ToListAsync();

    foreach (var campaign in interruptedCampaigns)
    {
        campaign.Status = "Interrupted";
        campaign.FinishedAtUtc = DateTime.UtcNow;
    }

    if (interruptedCampaigns.Count > 0)
    {
        await dbContext.SaveChangesAsync();
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "ApiBotWhatsapp.Api" }))
    .AllowAnonymous();

Directory.CreateDirectory(Path.Combine(app.Environment.ContentRootPath, "wwwroot", "uploads"));
app.UseStaticFiles();

app.UseCors("frontend");

app.UseAuthentication();

// Immediate account deactivation: without this, a JWT stays valid (and the user able to keep
// using the app) until it naturally expires (up to Jwt:ExpiresMinutes) even right after an
// admin deactivates the account (UsersController.Update). Only runs for requests that already
// carry a valid JWT, so anonymous endpoints (health, login, webhook) pay no extra DB cost.
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var idClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (int.TryParse(idClaim, out var userId))
        {
            var dbContext = context.RequestServices.GetRequiredService<AppDbContext>();
            var isActive = await dbContext.Users
                .Where(u => u.Id == userId)
                .Select(u => (bool?)u.IsActive)
                .FirstOrDefaultAsync();

            if (isActive != true)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsync("Conta desativada ou inexistente.");
                return;
            }
        }
    }

    await next();
});

app.UseAuthorization();

app.MapControllers();

app.Run();
