import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { freshTestDb, runMigrations, getTestAccountId, seedAccount, MockTauriDb } from "./setup";

let db: MockTauriDb;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => {
      db = freshTestDb();
      return Promise.resolve(db);
    }),
  },
}));

const mockRequest = vi.fn();

vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn(() => Promise.resolve({
    request: mockRequest,
    listLabels: vi.fn(),
    listThreads: vi.fn(),
    getThread: vi.fn(),
    modifyThread: vi.fn(),
    getHistory: vi.fn(),
  })),
}));

vi.mock("@/services/gmail/client");

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: Calendar", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetDb } = await import("@/services/db/connection");
    resetDb();
    await runMigrations();
    await seedAccount();
  });

  afterEach(() => {
    db?.close();
  });

  describe("Test #10: Calendar event create + sync", () => {
    it("creates a calendar event via Google Calendar API and persists it", async () => {
      mockRequest.mockResolvedValue({
        id: "google-event-1",
        summary: "Team Standup",
        description: "Daily standup meeting",
        start: { dateTime: "2026-05-14T09:00:00Z" },
        end: { dateTime: "2026-05-14T09:15:00Z" },
        status: "confirmed",
        iCalUID: "ical-uid-1@google.com",
        etag: "etag-1",
        htmlLink: "https://calendar.google.com/event?eid=abc",
      });

      const { GoogleCalendarProvider } = await import("@/services/calendar/googleCalendarProvider");
      const provider = new GoogleCalendarProvider(getTestAccountId());

      const createdEvent = await provider.createEvent("calendar-1", {
        summary: "Team Standup",
        description: "Daily standup meeting",
        startTime: "2026-05-14T09:00:00Z",
        endTime: "2026-05-14T09:15:00Z",
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.stringContaining("/calendars/calendar-1/events"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(createdEvent.summary).toBe("Team Standup");
      expect(createdEvent.remoteEventId).toBe("google-event-1");

      const { upsertCalendarEvent } = await import("@/services/db/calendarEvents");
      await upsertCalendarEvent({
        accountId: getTestAccountId(),
        googleEventId: createdEvent.remoteEventId,
        summary: createdEvent.summary,
        description: createdEvent.description,
        location: createdEvent.location,
        startTime: createdEvent.startTime,
        endTime: createdEvent.endTime,
        isAllDay: createdEvent.isAllDay,
        status: createdEvent.status,
        organizerEmail: createdEvent.organizerEmail,
        attendeesJson: createdEvent.attendeesJson,
        htmlLink: createdEvent.htmlLink,
        calendarId: "calendar-1",
        remoteEventId: createdEvent.remoteEventId,
        etag: createdEvent.etag,
        uid: createdEvent.uid,
      });

      const events = await db!.select<{ summary: string; google_event_id: string }[]>(
        "SELECT summary, google_event_id FROM calendar_events WHERE account_id = $1",
        [getTestAccountId()],
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.summary).toBe("Team Standup");
      expect(events[0]!.google_event_id).toBe("google-event-1");
    });

    it("syncs events from Google Calendar and stores them locally", async () => {
      const mockItems = [
        {
          id: "event-sync-1",
          summary: "Existing Event",
          start: { dateTime: "2026-05-14T11:00:00Z" },
          end: { dateTime: "2026-05-14T12:00:00Z" },
          status: "confirmed",
          iCalUID: "uid-1",
          etag: "etag-1",
        },
      ];
      mockRequest.mockResolvedValue({
        items: mockItems,
        nextSyncToken: "sync-token-123",
      });

      const { GoogleCalendarProvider } = await import("@/services/calendar/googleCalendarProvider");
      const provider = new GoogleCalendarProvider(getTestAccountId());

      const result = await provider.syncEvents("calendar-1");

      expect(result.created).toHaveLength(1);
      expect(result.newSyncToken).toBe("sync-token-123");
      expect(result.created[0]!.summary).toBe("Existing Event");
      expect(result.created[0]!.remoteEventId).toBe("event-sync-1");

      const { upsertCalendarEvent } = await import("@/services/db/calendarEvents");
      for (const event of result.created) {
        await upsertCalendarEvent({
          accountId: getTestAccountId(),
          googleEventId: event.remoteEventId,
          summary: event.summary,
          description: event.description,
          location: event.location,
          startTime: event.startTime,
          endTime: event.endTime,
          isAllDay: event.isAllDay,
          status: event.status,
          organizerEmail: event.organizerEmail,
          attendeesJson: event.attendeesJson,
          htmlLink: event.htmlLink,
          calendarId: "calendar-1",
          remoteEventId: event.remoteEventId,
          etag: event.etag,
          uid: event.uid,
        });
      }

      const stored = await db!.select<{ summary: string }[]>(
        "SELECT summary FROM calendar_events WHERE account_id = $1",
        [getTestAccountId()],
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]!.summary).toBe("Existing Event");
    });
  });
});
