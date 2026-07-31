using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveMultiTenantAndWhitelist : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Companies");

            migrationBuilder.DropTable(
                name: "UserCompanies");

            migrationBuilder.DropTable(
                name: "WhitelistNumbers");

            migrationBuilder.DropIndex(
                name: "IX_Turmas_CompanyId_Name",
                table: "Turmas");

            migrationBuilder.DropIndex(
                name: "IX_ScheduleRules_CompanyId_WhatsAppNumber",
                table: "ScheduleRules");

            migrationBuilder.DropIndex(
                name: "IX_MessageLogs_CompanyId_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs");

            migrationBuilder.DropIndex(
                name: "IX_Contatos_CompanyId_PhoneNumber",
                table: "Contatos");

            migrationBuilder.DropColumn(
                name: "CompanyId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CompanyId",
                table: "Turmas");

            migrationBuilder.DropColumn(
                name: "CompanyId",
                table: "ScheduleRules");

            migrationBuilder.DropColumn(
                name: "Message",
                table: "ScheduleRules");

            migrationBuilder.DropColumn(
                name: "CompanyId",
                table: "MessageLogs");

            migrationBuilder.DropColumn(
                name: "CompanyId",
                table: "Contatos");

            migrationBuilder.AddColumn<string>(
                name: "MessagesJson",
                table: "ScheduleRules",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");

            // Preserve existing single-message rules: the old flat `Message` text becomes a
            // single MessagesJson entry that applies to every day of the week, matching the
            // previous behavior (same message regardless of which day it is) until the rule
            // owner customizes per-day messages through the new UI.
            migrationBuilder.Sql(@"
UPDATE ScheduleRules
SET MessagesJson = json_array(json_object('text', Message, 'days', json_array(0, 1, 2, 3, 4, 5, 6)))
WHERE Message IS NOT NULL AND trim(Message) <> '';
");

            migrationBuilder.AddColumn<string>(
                name: "MessageId",
                table: "MessageLogs",
                type: "TEXT",
                maxLength: 150,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Turmas_Name",
                table: "Turmas",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleRules_WhatsAppNumber",
                table: "ScheduleRules",
                column: "WhatsAppNumber");

            migrationBuilder.CreateIndex(
                name: "IX_MessageLogs_MessageId",
                table: "MessageLogs",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_MessageLogs_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs",
                columns: new[] { "WhatsAppNumber", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Contatos_PhoneNumber",
                table: "Contatos",
                column: "PhoneNumber");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Turmas_Name",
                table: "Turmas");

            migrationBuilder.DropIndex(
                name: "IX_ScheduleRules_WhatsAppNumber",
                table: "ScheduleRules");

            migrationBuilder.DropIndex(
                name: "IX_MessageLogs_MessageId",
                table: "MessageLogs");

            migrationBuilder.DropIndex(
                name: "IX_MessageLogs_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs");

            migrationBuilder.DropIndex(
                name: "IX_Contatos_PhoneNumber",
                table: "Contatos");

            migrationBuilder.DropColumn(
                name: "MessagesJson",
                table: "ScheduleRules");

            migrationBuilder.DropColumn(
                name: "MessageId",
                table: "MessageLogs");

            migrationBuilder.AddColumn<int>(
                name: "CompanyId",
                table: "Users",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CompanyId",
                table: "Turmas",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CompanyId",
                table: "ScheduleRules",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Message",
                table: "ScheduleRules",
                type: "TEXT",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "CompanyId",
                table: "MessageLogs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "CompanyId",
                table: "Contatos",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "Companies",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    UniqueCode = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Companies", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserCompanies",
                columns: table => new
                {
                    UserId = table.Column<int>(type: "INTEGER", nullable: false),
                    CompanyId = table.Column<int>(type: "INTEGER", nullable: false),
                    AssignedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserCompanies", x => new { x.UserId, x.CompanyId });
                });

            migrationBuilder.CreateTable(
                name: "WhitelistNumbers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    CompanyId = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    PhoneNumber = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WhitelistNumbers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Turmas_CompanyId_Name",
                table: "Turmas",
                columns: new[] { "CompanyId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleRules_CompanyId_WhatsAppNumber",
                table: "ScheduleRules",
                columns: new[] { "CompanyId", "WhatsAppNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_MessageLogs_CompanyId_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs",
                columns: new[] { "CompanyId", "WhatsAppNumber", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Contatos_CompanyId_PhoneNumber",
                table: "Contatos",
                columns: new[] { "CompanyId", "PhoneNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Companies_UniqueCode",
                table: "Companies",
                column: "UniqueCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserCompanies_CompanyId",
                table: "UserCompanies",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_WhitelistNumbers_CompanyId_PhoneNumber",
                table: "WhitelistNumbers",
                columns: new[] { "CompanyId", "PhoneNumber" },
                unique: true);
        }
    }
}
