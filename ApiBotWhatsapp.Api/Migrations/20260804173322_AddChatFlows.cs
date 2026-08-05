using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddChatFlows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ChatFlows",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    TimeoutMinutes = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatFlows", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ChatFlowSteps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ChatFlowId = table.Column<int>(type: "INTEGER", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    MessageText = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false),
                    IsStartStep = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsEndStep = table.Column<bool>(type: "INTEGER", nullable: false),
                    InvalidAnswerMessage = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatFlowSteps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatFlowSteps_ChatFlows_ChatFlowId",
                        column: x => x.ChatFlowId,
                        principalTable: "ChatFlows",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChatFlowConversations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    PhoneNumber = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    ChatFlowId = table.Column<int>(type: "INTEGER", nullable: false),
                    CurrentStepId = table.Column<int>(type: "INTEGER", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    LastMessageAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatFlowConversations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatFlowConversations_ChatFlowSteps_CurrentStepId",
                        column: x => x.CurrentStepId,
                        principalTable: "ChatFlowSteps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ChatFlowOptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ChatFlowStepId = table.Column<int>(type: "INTEGER", nullable: false),
                    Label = table.Column<string>(type: "TEXT", maxLength: 150, nullable: false),
                    MatchKeywordsJson = table.Column<string>(type: "TEXT", nullable: false),
                    NextStepId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatFlowOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatFlowOptions_ChatFlowSteps_ChatFlowStepId",
                        column: x => x.ChatFlowStepId,
                        principalTable: "ChatFlowSteps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ChatFlowOptions_ChatFlowSteps_NextStepId",
                        column: x => x.NextStepId,
                        principalTable: "ChatFlowSteps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChatFlowConversations_CurrentStepId",
                table: "ChatFlowConversations",
                column: "CurrentStepId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatFlowConversations_OwnerUserId_PhoneNumber",
                table: "ChatFlowConversations",
                columns: new[] { "OwnerUserId", "PhoneNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChatFlowOptions_ChatFlowStepId",
                table: "ChatFlowOptions",
                column: "ChatFlowStepId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatFlowOptions_NextStepId",
                table: "ChatFlowOptions",
                column: "NextStepId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatFlows_OwnerUserId",
                table: "ChatFlows",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatFlowSteps_ChatFlowId",
                table: "ChatFlowSteps",
                column: "ChatFlowId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChatFlowConversations");

            migrationBuilder.DropTable(
                name: "ChatFlowOptions");

            migrationBuilder.DropTable(
                name: "ChatFlowSteps");

            migrationBuilder.DropTable(
                name: "ChatFlows");
        }
    }
}
