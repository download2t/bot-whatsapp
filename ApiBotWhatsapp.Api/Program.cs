using System.Text;
using ApiBotWhatsapp.Api.Data;
using ApiBotWhatsapp.Api.Models;
using ApiBotWhatsapp.Api.Services;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.Data.Common;

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
    dbContext.Database.EnsureCreated();
    await EnsureScheduleRuleColumnsAsync(dbContext);
    await EnsureUserColumnsAsync(dbContext);
    await SeedData.InitializeAsync(dbContext);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health", () => Results.Ok(new { ok = true, service = "ApiBotWhatsapp.Api" }))
    .AllowAnonymous();

app.UseCors("frontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

static async Task EnsureScheduleRuleColumnsAsync(AppDbContext dbContext)
{
    await using var connection = dbContext.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open)
    {
        await connection.OpenAsync();
    }

    var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    await using (var cmd = connection.CreateCommand())
    {
        cmd.CommandText = "PRAGMA table_info('ScheduleRules');";
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            existingColumns.Add(reader.GetString(1));
        }
    }

    var ddl = new List<string>();
    if (!existingColumns.Contains("ThrottleMinutes"))
    {
        ddl.Add("ALTER TABLE ScheduleRules ADD COLUMN ThrottleMinutes INTEGER NOT NULL DEFAULT 0;");
    }

    if (!existingColumns.Contains("IsOutOfBusinessHours"))
    {
        ddl.Add("ALTER TABLE ScheduleRules ADD COLUMN IsOutOfBusinessHours INTEGER NOT NULL DEFAULT 0;");
    }

    if (!existingColumns.Contains("MaxDailyMessagesPerUser"))
    {
        ddl.Add("ALTER TABLE ScheduleRules ADD COLUMN MaxDailyMessagesPerUser INTEGER NULL;");
    }

    var whitelistColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    await using (var whitelistCmd = connection.CreateCommand())
    {
        whitelistCmd.CommandText = "PRAGMA table_info('WhitelistNumbers');";
        await using var reader = await whitelistCmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            whitelistColumns.Add(reader.GetString(1));
        }
    }

    if (!whitelistColumns.Contains("Name"))
    {
        ddl.Add("ALTER TABLE WhitelistNumbers ADD COLUMN Name TEXT NULL;");
    }

    foreach (var sql in ddl)
    {
        await dbContext.Database.ExecuteSqlRawAsync(sql);

        // Update existing users with NULL CreatedAtUtc to current date
        await dbContext.Database.ExecuteSqlRawAsync("UPDATE Users SET CreatedAtUtc = datetime('now') WHERE CreatedAtUtc IS NULL;");
    }
}

static async Task EnsureUserColumnsAsync(AppDbContext dbContext)
{
    await using var connection = dbContext.Database.GetDbConnection();
    if (connection.State != System.Data.ConnectionState.Open)
    {
        await connection.OpenAsync();
    }

    var userColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    await using (var cmd = connection.CreateCommand())
    {
        cmd.CommandText = "PRAGMA table_info('Users');";
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            userColumns.Add(reader.GetString(1));
        }
    }

    var ddl = new List<string>();
    if (!userColumns.Contains("Email"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN Email TEXT NULL;");
    }

    if (!userColumns.Contains("Phone"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN Phone TEXT NULL;");
    }

    if (!userColumns.Contains("Cpf"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN Cpf TEXT NULL;");
    }

    if (!userColumns.Contains("FullName"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN FullName TEXT NULL;");
    }

    if (!userColumns.Contains("Title"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN Title TEXT NULL;");
    }

    if (!userColumns.Contains("Notes"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN Notes TEXT NULL;");
    }

    if (!userColumns.Contains("CreatedAtUtc"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN CreatedAtUtc TEXT NULL;");
    }

    if (!userColumns.Contains("UpdatedAtUtc"))
    {
        ddl.Add("ALTER TABLE Users ADD COLUMN UpdatedAtUtc TEXT NULL;");
    }

    foreach (var sql in ddl)
    {
        await dbContext.Database.ExecuteSqlRawAsync(sql);
    }
}
