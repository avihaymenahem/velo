import { CalDAVProvider } from "./caldavProvider";

const MOCK_ICAL_DATA =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid\r\nSUMMARY:Test Event\r\nDTSTART:20240101T100000Z\r\nDTEND:20240101T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";

const MOCK_ICAL_DATA_2 =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-uid-2\r\nSUMMARY:Second Event\r\nDTSTART:20240102T140000Z\r\nDTEND:20240102T150000Z\r\nEND:VEVENT\r\nEND:VCALENDAR";

const mockLogin = vi.fn().mockResolvedValue(undefined);
const mockFetchCalendars = vi.fn();
const mockFetchCalendarObjects = vi.fn();
const mockCreateCalendarObject = vi.fn().mockResolvedValue(undefined);
const mockUpdateCalendarObject = vi.fn().mockResolvedValue(undefined);
const mockDeleteCalendarObject = vi.fn().mockResolvedValue(undefined);

vi.mock("tsdav", () => {
  const MockDAVClient = vi.fn(function (this: Record<string, unknown>) {
    this.login = mockLogin;
    this.fetchCalendars = mockFetchCalendars;
    this.fetchCalendarObjects = mockFetchCalendarObjects;
    this.createCalendarObject = mockCreateCalendarObject;
    this.updateCalendarObject = mockUpdateCalendarObject;
    this.deleteCalendarObject = mockDeleteCalendarObject;
  });
  return { DAVClient: MockDAVClient };
});

vi.mock("@/services/db/accounts", () => ({
  getAccount: vi.fn().mockResolvedValue({
    id: "acc-1",
    email: "user@example.com",
    caldav_url: "https://caldav.example.com",
    caldav_username: "user@example.com",
    caldav_password: "secret",
  }),
}));

describe("CalDAVProvider", () => {
  let provider: CalDAVProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CalDAVProvider("acc-1");
  });

  describe("listCalendars", () => {
    it("maps tsdav calendars to CalendarInfo array", async () => {
      mockFetchCalendars.mockResolvedValue([
        { url: "/cal/personal/", displayName: "Personal" },
        { url: "/cal/work/", displayName: "Work", calendarColor: "#ff0000" },
      ]);

      const calendars = await provider.listCalendars();

      expect(calendars).toEqual([
        { remoteId: "/cal/personal/", displayName: "Personal", color: null, isPrimary: true },
        { remoteId: "/cal/work/", displayName: "Work", color: "#ff0000", isPrimary: false },
      ]);
    });

    it("handles non-string displayName by falling back to indexed name", async () => {
      mockFetchCalendars.mockResolvedValue([
        { url: "/cal/unnamed/", displayName: undefined },
        { url: "/cal/also-unnamed/", displayName: null },
      ]);

      const calendars = await provider.listCalendars();

      expect(calendars[0]!.displayName).toBe("Calendar 1");
      expect(calendars[1]!.displayName).toBe("Calendar 2");
    });
  });

  describe("fetchEvents", () => {
    it("passes time range and parses iCalendar data from objects", async () => {
      mockFetchCalendarObjects.mockResolvedValue([
        { data: MOCK_ICAL_DATA, url: "/cal/personal/test-uid.ics", etag: '"etag-1"' },
        { data: MOCK_ICAL_DATA_2, url: "/cal/personal/test-uid-2.ics", etag: '"etag-2"' },
      ]);

      const events = await provider.fetchEvents("/cal/personal/", "2024-01-01T00:00:00Z", "2024-01-31T23:59:59Z");

      expect(mockFetchCalendarObjects).toHaveBeenCalledWith({
        calendar: { url: "/cal/personal/" },
        timeRange: { start: "2024-01-01T00:00:00Z", end: "2024-01-31T23:59:59Z" },
      });

      expect(events).toHaveLength(2);
      expect(events[0]!.summary).toBe("Test Event");
      expect(events[0]!.uid).toBe("test-uid");
      expect(events[0]!.etag).toBe('"etag-1"');
      expect(events[0]!.remoteEventId).toBe("/cal/personal/test-uid.ics");
      expect(events[1]!.summary).toBe("Second Event");
      expect(events[1]!.etag).toBe('"etag-2"');
    });

    it("filters out objects with no data", async () => {
      mockFetchCalendarObjects.mockResolvedValue([
        { data: MOCK_ICAL_DATA, url: "/cal/personal/test-uid.ics", etag: '"etag-1"' },
        { data: null, url: "/cal/personal/empty.ics", etag: null },
      ]);

      const events = await provider.fetchEvents("/cal/personal/", "2024-01-01T00:00:00Z", "2024-01-31T23:59:59Z");

      expect(events).toHaveLength(1);
    });
  });

  describe("createEvent", () => {
    it("generates iCalendar and calls createCalendarObject", async () => {
      vi.spyOn(crypto, "randomUUID").mockReturnValue("generated-uuid" as `${string}-${string}-${string}-${string}-${string}`);

      const event = await provider.createEvent("/cal/personal/", {
        summary: "New Meeting",
        startTime: "2024-03-15T09:00:00Z",
        endTime: "2024-03-15T10:00:00Z",
      });

      expect(mockCreateCalendarObject).toHaveBeenCalledWith({
        calendar: { url: "/cal/personal/" },
        filename: "generated-uuid.ics",
        iCalString: expect.stringContaining("SUMMARY:New Meeting"),
      });

      expect(event.summary).toBe("New Meeting");
      expect(event.remoteEventId).toBe("/cal/personal/generated-uuid.ics");
    });
  });

  describe("updateEvent", () => {
    it("fetches existing, merges updates, and calls updateCalendarObject", async () => {
      mockFetchCalendarObjects.mockResolvedValue([
        { data: MOCK_ICAL_DATA, url: "/cal/personal/test-uid.ics", etag: '"old-etag"' },
      ]);

      const event = await provider.updateEvent(
        "/cal/personal/",
        "/cal/personal/test-uid.ics",
        { summary: "Updated Event" },
        '"old-etag"',
      );

      expect(mockFetchCalendarObjects).toHaveBeenCalledWith({
        calendar: { url: "/cal/personal/" },
        objectUrls: ["/cal/personal/test-uid.ics"],
      });

      expect(mockUpdateCalendarObject).toHaveBeenCalledWith({
        calendarObject: {
          url: "/cal/personal/test-uid.ics",
          data: expect.stringContaining("SUMMARY:Updated Event"),
          etag: '"old-etag"',
        },
        headers: { "If-Match": '"old-etag"' },
      });

      expect(event.summary).toBe("Updated Event");
      expect(event.remoteEventId).toBe("/cal/personal/test-uid.ics");
    });

    it("throws when the existing event is not found", async () => {
      mockFetchCalendarObjects.mockResolvedValue([]);

      await expect(
        provider.updateEvent("/cal/personal/", "/cal/personal/missing.ics", { summary: "Nope" }),
      ).rejects.toThrow("Event not found on server");
    });
  });

  describe("deleteEvent", () => {
    it("calls deleteCalendarObject with etag", async () => {
      await provider.deleteEvent("/cal/personal/", "/cal/personal/test-uid.ics", '"delete-etag"');

      expect(mockDeleteCalendarObject).toHaveBeenCalledWith({
        calendarObject: {
          url: "/cal/personal/test-uid.ics",
          etag: '"delete-etag"',
        },
        headers: { "If-Match": '"delete-etag"' },
      });
    });

    it("calls deleteCalendarObject without etag when not provided", async () => {
      await provider.deleteEvent("/cal/personal/", "/cal/personal/test-uid.ics");

      expect(mockDeleteCalendarObject).toHaveBeenCalledWith({
        calendarObject: {
          url: "/cal/personal/test-uid.ics",
          etag: undefined,
        },
        headers: {},
      });
    });
  });

  describe("syncEvents", () => {
    it("fetches all objects in time range and returns them as created events", async () => {
      mockFetchCalendarObjects.mockResolvedValue([
        { data: MOCK_ICAL_DATA, url: "/cal/personal/test-uid.ics", etag: '"sync-etag"' },
        { data: MOCK_ICAL_DATA_2, url: "/cal/personal/test-uid-2.ics", etag: '"sync-etag-2"' },
      ]);

      const result = await provider.syncEvents("/cal/personal/");

      expect(mockFetchCalendarObjects).toHaveBeenCalledWith({
        calendar: { url: "/cal/personal/" },
        timeRange: {
          start: expect.any(String),
          end: expect.any(String),
        },
      });

      expect(result.created).toHaveLength(2);
      expect(result.created[0]!.summary).toBe("Test Event");
      expect(result.created[0]!.etag).toBe('"sync-etag"');
      expect(result.created[1]!.summary).toBe("Second Event");
      expect(result.updated).toEqual([]);
      expect(result.deletedRemoteIds).toEqual([]);
      expect(result.newSyncToken).toBeNull();
      expect(result.newCtag).toBeNull();
    });
  });

  describe("testConnection", () => {
    it("returns success with calendar count on successful connection", async () => {
      mockFetchCalendars.mockResolvedValue([
        { url: "/cal/personal/", displayName: "Personal" },
        { url: "/cal/work/", displayName: "Work" },
      ]);

      const result = await provider.testConnection();

      expect(result).toEqual({
        success: true,
        message: "Connected — found 2 calendars",
      });
    });

    it("returns singular form for one calendar", async () => {
      mockFetchCalendars.mockResolvedValue([
        { url: "/cal/personal/", displayName: "Personal" },
      ]);

      const result = await provider.testConnection();

      expect(result.message).toBe("Connected — found 1 calendar");
    });

    it("resets client and returns error message on failure", async () => {
      mockLogin.mockRejectedValueOnce(new Error("Authentication failed"));
      // Need a fresh provider so getClient() will attempt login again
      const freshProvider = new CalDAVProvider("acc-1");

      const result = await freshProvider.testConnection();

      expect(result).toEqual({
        success: false,
        message: "Authentication failed",
      });

      // Verify client was reset by confirming a second call attempts login again
      mockLogin.mockResolvedValueOnce(undefined);
      mockFetchCalendars.mockResolvedValue([]);
      const retryResult = await freshProvider.testConnection();
      expect(retryResult.success).toBe(true);
      expect(mockLogin).toHaveBeenCalledTimes(2); // initial fail + retry after client reset
    });

    it("handles non-Error thrown values gracefully", async () => {
      mockLogin.mockRejectedValueOnce("some string error");
      const freshProvider = new CalDAVProvider("acc-1");

      const result = await freshProvider.testConnection();

      expect(result).toEqual({
        success: false,
        message: "Connection failed",
      });
    });
  });
});
