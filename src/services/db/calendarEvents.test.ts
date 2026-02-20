import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
    selectFirstBy: vi.fn(),
  };
});

import { getDb, selectFirstBy } from "@/services/db/connection";
import {
  upsertCalendarEvent,
  getCalendarEventsInRange,
  getCalendarEventsInRangeMulti,
  deleteEventsForCalendar,
  getEventByRemoteId,
  deleteEventByRemoteId,
  deleteCalendarEvent,
  type DbCalendarEvent,
} from "./calendarEvents";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

const makeEvent = (overrides: Partial<DbCalendarEvent> = {}): DbCalendarEvent => ({
  id: "evt-1",
  account_id: "acc-1",
  google_event_id: "gev-1",
  summary: "Team standup",
  description: "Daily sync",
  location: "Room A",
  start_time: 1000,
  end_time: 2000,
  is_all_day: 0,
  status: "confirmed",
  organizer_email: "org@example.com",
  attendees_json: null,
  html_link: "https://calendar.google.com/event/1",
  updated_at: 999,
  calendar_id: null,
  remote_event_id: null,
  etag: null,
  ical_data: null,
  uid: null,
  ...overrides,
});

describe("calendarEvents service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("upsertCalendarEvent", () => {
    it("inserts event with all fields including CalDAV fields", async () => {
      await upsertCalendarEvent({
        accountId: "acc-1",
        googleEventId: "gev-1",
        summary: "Team standup",
        description: "Daily sync",
        location: "Room A",
        startTime: 1000,
        endTime: 2000,
        isAllDay: false,
        status: "confirmed",
        organizerEmail: "org@example.com",
        attendeesJson: '[{"email":"a@b.com"}]',
        htmlLink: "https://calendar.google.com/event/1",
        calendarId: "cal-1",
        remoteEventId: "remote-1",
        etag: '"etag-abc"',
        icalData: "BEGIN:VEVENT\nEND:VEVENT",
        uid: "uid-123@example.com",
      });

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO calendar_events");
      expect(sql).toContain("ON CONFLICT(account_id, google_event_id) DO UPDATE");
      // params[0] is the generated UUID id, skip it
      expect(params[1]).toBe("acc-1");
      expect(params[2]).toBe("gev-1");
      expect(params[3]).toBe("Team standup");
      expect(params[4]).toBe("Daily sync");
      expect(params[5]).toBe("Room A");
      expect(params[6]).toBe(1000);
      expect(params[7]).toBe(2000);
      expect(params[8]).toBe(0); // isAllDay false -> 0
      expect(params[9]).toBe("confirmed");
      expect(params[10]).toBe("org@example.com");
      expect(params[11]).toBe('[{"email":"a@b.com"}]');
      expect(params[12]).toBe("https://calendar.google.com/event/1");
      expect(params[13]).toBe("cal-1");
      expect(params[14]).toBe("remote-1");
      expect(params[15]).toBe('"etag-abc"');
      expect(params[16]).toBe("BEGIN:VEVENT\nEND:VEVENT");
      expect(params[17]).toBe("uid-123@example.com");
    });

    it("converts isAllDay true to 1", async () => {
      await upsertCalendarEvent({
        accountId: "acc-1",
        googleEventId: "gev-2",
        summary: null,
        description: null,
        location: null,
        startTime: 1000,
        endTime: 2000,
        isAllDay: true,
        status: "confirmed",
        organizerEmail: null,
        attendeesJson: null,
        htmlLink: null,
      });

      const [, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(params[8]).toBe(1);
    });

    it("defaults optional CalDAV fields to null", async () => {
      await upsertCalendarEvent({
        accountId: "acc-1",
        googleEventId: "gev-3",
        summary: null,
        description: null,
        location: null,
        startTime: 1000,
        endTime: 2000,
        isAllDay: false,
        status: "confirmed",
        organizerEmail: null,
        attendeesJson: null,
        htmlLink: null,
      });

      const [, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(params[13]).toBeNull(); // calendarId
      expect(params[14]).toBeNull(); // remoteEventId
      expect(params[15]).toBeNull(); // etag
      expect(params[16]).toBeNull(); // icalData
      expect(params[17]).toBeNull(); // uid
    });

    it("updates existing event on conflict (same account_id + google_event_id)", async () => {
      await upsertCalendarEvent({
        accountId: "acc-1",
        googleEventId: "gev-1",
        summary: "Updated standup",
        description: null,
        location: null,
        startTime: 3000,
        endTime: 4000,
        isAllDay: false,
        status: "tentative",
        organizerEmail: null,
        attendeesJson: null,
        htmlLink: null,
        calendarId: "cal-2",
        remoteEventId: "remote-2",
        etag: '"etag-new"',
        icalData: "BEGIN:VEVENT\nUPDATED\nEND:VEVENT",
        uid: "uid-456@example.com",
      });

      const [sql, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("ON CONFLICT(account_id, google_event_id) DO UPDATE SET");
      expect(sql).toContain("calendar_id = $14");
      expect(sql).toContain("remote_event_id = $15");
      expect(sql).toContain("etag = $16");
      expect(sql).toContain("ical_data = $17");
      expect(sql).toContain("uid = $18");
      expect(sql).toContain("updated_at = unixepoch()");
      expect(params[3]).toBe("Updated standup");
      expect(params[6]).toBe(3000);
      expect(params[7]).toBe(4000);
      expect(params[9]).toBe("tentative");
    });
  });

  describe("getCalendarEventsInRange", () => {
    it("returns events within the given time range", async () => {
      const events = [makeEvent(), makeEvent({ id: "evt-2", start_time: 1500 })];
      mockDb.select.mockResolvedValueOnce(events);

      const result = await getCalendarEventsInRange("acc-1", 500, 2500);

      expect(result).toEqual(events);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.select.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("WHERE account_id = $1 AND start_time < $3 AND end_time > $2");
      expect(sql).toContain("ORDER BY start_time ASC");
      expect(params).toEqual(["acc-1", 500, 2500]);
    });

    it("returns empty array when no events match", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      const result = await getCalendarEventsInRange("acc-1", 5000, 6000);

      expect(result).toEqual([]);
    });
  });

  describe("getCalendarEventsInRangeMulti", () => {
    it("filters by calendar IDs and includes null calendar_id events", async () => {
      const events = [
        makeEvent({ calendar_id: "cal-1" }),
        makeEvent({ id: "evt-2", calendar_id: null }),
      ];
      mockDb.select.mockResolvedValueOnce(events);

      const result = await getCalendarEventsInRangeMulti("acc-1", ["cal-1", "cal-2"], 500, 2500);

      expect(result).toEqual(events);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.select.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("calendar_id IN ($4, $5)");
      expect(sql).toContain("OR calendar_id IS NULL");
      expect(params).toEqual(["acc-1", 500, 2500, "cal-1", "cal-2"]);
    });

    it("falls back to getCalendarEventsInRange when calendarIds is empty", async () => {
      const events = [makeEvent()];
      mockDb.select.mockResolvedValueOnce(events);

      const result = await getCalendarEventsInRangeMulti("acc-1", [], 500, 2500);

      expect(result).toEqual(events);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.select.mock.calls[0] as [string, unknown[]];
      // Should use the simple range query (no calendar_id filter)
      expect(sql).not.toContain("calendar_id IN");
      expect(sql).toContain("WHERE account_id = $1 AND start_time < $3 AND end_time > $2");
      expect(params).toEqual(["acc-1", 500, 2500]);
    });
  });

  describe("deleteEventsForCalendar", () => {
    it("removes all events for a given calendar_id", async () => {
      await deleteEventsForCalendar("cal-1");

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe("DELETE FROM calendar_events WHERE calendar_id = $1");
      expect(params).toEqual(["cal-1"]);
    });
  });

  describe("getEventByRemoteId", () => {
    it("returns event matching calendar_id and remote_event_id", async () => {
      const event = makeEvent({ calendar_id: "cal-1", remote_event_id: "remote-1" });
      vi.mocked(selectFirstBy).mockResolvedValueOnce(event);

      const result = await getEventByRemoteId("cal-1", "remote-1");

      expect(result).toEqual(event);
      expect(selectFirstBy).toHaveBeenCalledTimes(1);
      const [sql, params] = vi.mocked(selectFirstBy).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("WHERE calendar_id = $1 AND remote_event_id = $2");
      expect(params).toEqual(["cal-1", "remote-1"]);
    });

    it("returns null when no event matches", async () => {
      vi.mocked(selectFirstBy).mockResolvedValueOnce(null);

      const result = await getEventByRemoteId("cal-1", "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("deleteEventByRemoteId", () => {
    it("removes event matching calendar_id and remote_event_id", async () => {
      await deleteEventByRemoteId("cal-1", "remote-1");

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe("DELETE FROM calendar_events WHERE calendar_id = $1 AND remote_event_id = $2");
      expect(params).toEqual(["cal-1", "remote-1"]);
    });
  });

  describe("deleteCalendarEvent", () => {
    it("removes event by id", async () => {
      await deleteCalendarEvent("evt-1");

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.execute.mock.calls[0] as [string, unknown[]];
      expect(sql).toBe("DELETE FROM calendar_events WHERE id = $1");
      expect(params).toEqual(["evt-1"]);
    });
  });
});
