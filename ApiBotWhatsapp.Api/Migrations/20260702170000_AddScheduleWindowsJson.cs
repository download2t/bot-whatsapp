using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduleWindowsJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ScheduleWindowsJson",
                table: "ScheduleRules",
                type: "TEXT",
                nullable: false,
                defaultValue: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScheduleWindowsJson",
                table: "ScheduleRules");
        }
    }
}