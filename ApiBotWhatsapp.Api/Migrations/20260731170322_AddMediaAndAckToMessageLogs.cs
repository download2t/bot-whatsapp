using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaAndAckToMessageLogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AckStatus",
                table: "MessageLogs",
                type: "TEXT",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MediaFileName",
                table: "MessageLogs",
                type: "TEXT",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MediaMimeType",
                table: "MessageLogs",
                type: "TEXT",
                maxLength: 150,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MediaUrl",
                table: "MessageLogs",
                type: "TEXT",
                maxLength: 300,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AckStatus",
                table: "MessageLogs");

            migrationBuilder.DropColumn(
                name: "MediaFileName",
                table: "MessageLogs");

            migrationBuilder.DropColumn(
                name: "MediaMimeType",
                table: "MessageLogs");

            migrationBuilder.DropColumn(
                name: "MediaUrl",
                table: "MessageLogs");
        }
    }
}
