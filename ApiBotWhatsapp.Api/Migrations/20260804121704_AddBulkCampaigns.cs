using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBulkCampaigns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BulkCampaigns",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    TurmaId = table.Column<int>(type: "INTEGER", nullable: true),
                    Greeting = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    MessageTemplate = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false),
                    IntervalSeconds = table.Column<int>(type: "INTEGER", nullable: false),
                    MarkAsUnread = table.Column<bool>(type: "INTEGER", nullable: false),
                    MediaUrl = table.Column<string>(type: "TEXT", maxLength: 300, nullable: true),
                    MediaMimeType = table.Column<string>(type: "TEXT", maxLength: 150, nullable: true),
                    MediaFileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    AbortReason = table.Column<string>(type: "TEXT", maxLength: 300, nullable: true),
                    TotalCount = table.Column<int>(type: "INTEGER", nullable: false),
                    SentCount = table.Column<int>(type: "INTEGER", nullable: false),
                    FailedCount = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    FinishedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BulkCampaigns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BulkCampaignItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    BulkCampaignId = table.Column<int>(type: "INTEGER", nullable: false),
                    ContactId = table.Column<int>(type: "INTEGER", nullable: false),
                    ContactName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    PhoneNumber = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    StatusDetail = table.Column<string>(type: "TEXT", maxLength: 300, nullable: true),
                    MessageId = table.Column<string>(type: "TEXT", maxLength: 150, nullable: true),
                    ProcessedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BulkCampaignItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BulkCampaignItems_BulkCampaigns_BulkCampaignId",
                        column: x => x.BulkCampaignId,
                        principalTable: "BulkCampaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BulkCampaignItems_BulkCampaignId",
                table: "BulkCampaignItems",
                column: "BulkCampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_BulkCampaigns_OwnerUserId_CreatedAtUtc",
                table: "BulkCampaigns",
                columns: new[] { "OwnerUserId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BulkCampaignItems");

            migrationBuilder.DropTable(
                name: "BulkCampaigns");
        }
    }
}
