using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduleRuleAudience : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AudienceMode",
                table: "ScheduleRules",
                type: "TEXT",
                maxLength: 30,
                nullable: false,
                defaultValue: "RegisteredContacts");

            migrationBuilder.AddColumn<int>(
                name: "ExcludedTurmaId",
                table: "ScheduleRules",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AudienceMode",
                table: "ScheduleRules");

            migrationBuilder.DropColumn(
                name: "ExcludedTurmaId",
                table: "ScheduleRules");
        }
    }
}
