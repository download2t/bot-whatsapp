using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiBotWhatsapp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCalendarBirthdayNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CalendarBirthdayNotificationLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    CalendarPersonId = table.Column<int>(type: "INTEGER", nullable: true),
                    PersonName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    NotificationDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    SentAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Success = table.Column<bool>(type: "INTEGER", nullable: false),
                    StatusDetail = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarBirthdayNotificationLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CalendarBirthdayNotificationLogs_CalendarPeople_CalendarPersonId",
                        column: x => x.CalendarPersonId,
                        principalTable: "CalendarPeople",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "CalendarBirthdayNotificationSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OwnerUserId = table.Column<int>(type: "INTEGER", nullable: false),
                    IsEnabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    TargetPhoneNumber = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    MessageTemplate = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    NotifyHour = table.Column<int>(type: "INTEGER", nullable: false),
                    NotifyMinute = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CalendarBirthdayNotificationSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CalendarBirthdayNotificationLogs_CalendarPersonId",
                table: "CalendarBirthdayNotificationLogs",
                column: "CalendarPersonId");

            migrationBuilder.CreateIndex(
                name: "IX_CalendarBirthdayNotificationLogs_OwnerUserId_CalendarPersonId_NotificationDate",
                table: "CalendarBirthdayNotificationLogs",
                columns: new[] { "OwnerUserId", "CalendarPersonId", "NotificationDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CalendarBirthdayNotificationSettings_OwnerUserId",
                table: "CalendarBirthdayNotificationSettings",
                column: "OwnerUserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CalendarBirthdayNotificationLogs");

            migrationBuilder.DropTable(
                name: "CalendarBirthdayNotificationSettings");
        }
    }
}
