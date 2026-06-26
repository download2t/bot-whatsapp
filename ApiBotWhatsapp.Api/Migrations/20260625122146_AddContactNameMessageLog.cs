using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddContactNameMessageLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "MessageLogs",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "MessageLogs");
        }
    }
}
