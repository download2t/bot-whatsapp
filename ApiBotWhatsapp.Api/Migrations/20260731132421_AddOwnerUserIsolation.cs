using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOwnerUserIsolation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ScheduleRuleWhatsAppNumbers");

            migrationBuilder.DropIndex(
                name: "IX_Turmas_Name",
                table: "Turmas");

            migrationBuilder.DropIndex(
                name: "IX_ScheduleRules_WhatsAppNumber",
                table: "ScheduleRules");

            migrationBuilder.DropIndex(
                name: "IX_MessageLogs_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs");

            migrationBuilder.DropIndex(
                name: "IX_Contatos_PhoneNumber",
                table: "Contatos");

            migrationBuilder.DropColumn(
                name: "WhatsAppNumber",
                table: "ScheduleRules");

            migrationBuilder.AddColumn<int>(
                name: "OwnerUserId",
                table: "Turmas",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "OwnerUserId",
                table: "ScheduleRules",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "OwnerUserId",
                table: "MessageLogs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "OwnerUserId",
                table: "Contatos",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Per-user isolation is new: every pre-existing row (Turmas, ScheduleRules,
            // MessageLogs, Contatos) had no owner before. Assign them all to the `admin`
            // user so nothing is orphaned; reassign manually afterward if needed. On a
            // fresh/empty database these UPDATEs simply affect zero rows.
            migrationBuilder.Sql(@"
UPDATE Turmas SET OwnerUserId = (SELECT Id FROM Users WHERE Username = 'admin' LIMIT 1) WHERE OwnerUserId = 0;
UPDATE ScheduleRules SET OwnerUserId = (SELECT Id FROM Users WHERE Username = 'admin' LIMIT 1) WHERE OwnerUserId = 0;
UPDATE MessageLogs SET OwnerUserId = (SELECT Id FROM Users WHERE Username = 'admin' LIMIT 1) WHERE OwnerUserId = 0;
UPDATE Contatos SET OwnerUserId = (SELECT Id FROM Users WHERE Username = 'admin' LIMIT 1) WHERE OwnerUserId = 0;
");

            migrationBuilder.CreateIndex(
                name: "IX_Turmas_OwnerUserId_Name",
                table: "Turmas",
                columns: new[] { "OwnerUserId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleRules_OwnerUserId",
                table: "ScheduleRules",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MessageLogs_OwnerUserId_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs",
                columns: new[] { "OwnerUserId", "WhatsAppNumber", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Contatos_OwnerUserId_PhoneNumber",
                table: "Contatos",
                columns: new[] { "OwnerUserId", "PhoneNumber" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Turmas_OwnerUserId_Name",
                table: "Turmas");

            migrationBuilder.DropIndex(
                name: "IX_ScheduleRules_OwnerUserId",
                table: "ScheduleRules");

            migrationBuilder.DropIndex(
                name: "IX_MessageLogs_OwnerUserId_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs");

            migrationBuilder.DropIndex(
                name: "IX_Contatos_OwnerUserId_PhoneNumber",
                table: "Contatos");

            migrationBuilder.DropColumn(
                name: "OwnerUserId",
                table: "Turmas");

            migrationBuilder.DropColumn(
                name: "OwnerUserId",
                table: "ScheduleRules");

            migrationBuilder.DropColumn(
                name: "OwnerUserId",
                table: "MessageLogs");

            migrationBuilder.DropColumn(
                name: "OwnerUserId",
                table: "Contatos");

            migrationBuilder.AddColumn<string>(
                name: "WhatsAppNumber",
                table: "ScheduleRules",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ScheduleRuleWhatsAppNumbers",
                columns: table => new
                {
                    ScheduleRuleId = table.Column<int>(type: "INTEGER", nullable: false),
                    WhatsAppNumber = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScheduleRuleWhatsAppNumbers", x => new { x.ScheduleRuleId, x.WhatsAppNumber });
                });

            migrationBuilder.CreateIndex(
                name: "IX_Turmas_Name",
                table: "Turmas",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleRules_WhatsAppNumber",
                table: "ScheduleRules",
                column: "WhatsAppNumber");

            migrationBuilder.CreateIndex(
                name: "IX_MessageLogs_WhatsAppNumber_TimestampUtc",
                table: "MessageLogs",
                columns: new[] { "WhatsAppNumber", "TimestampUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Contatos_PhoneNumber",
                table: "Contatos",
                column: "PhoneNumber");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleRuleWhatsAppNumbers_WhatsAppNumber",
                table: "ScheduleRuleWhatsAppNumbers",
                column: "WhatsAppNumber");
        }
    }
}
