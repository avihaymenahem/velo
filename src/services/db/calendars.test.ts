import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: mockGetDb,
    selectFirstBy: async (query: string, params: unknown[] = []) => {
      const db = await mockGetDb();
      const rows = await db.select(query, params);
      return rows[0] ?? null;
    },
  };
});

import { getDb } from "@/services/db/connection";
import {
  upsertCalendar,
  getCalendarsForAccount,
  getVisibleCalendars,
  setCalendarVisibility,
  updateCalendarSyncToken,
  deleteCalendarsForAccount,
  getCalendarById,
} from "./calendars";
import type { DbCalendar } from "./calendars";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

const MOCK_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("calendars service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(
      mockDb as unknown as Awaited<ReturnType<typeof getDb>>,
    );
    vi.stubGlobal("crypto", {
      randomUUID: () => MOCK_UUID,
    });
  });

  describe("upsertCalendar", () => {
    it("inserts a new calendar and returns the id", async () => {
      // selectFirstBy query returns the newly inserted row
      mockDb.select.mockResolvedValueOnce([{ id: MOCK_UUID }]);

      const id = await upsertCalendar({
        accountId: "acc-1",
        provider: "google",
        remoteId: "remote-cal-1",
        displayName: "My Calendar",
        color: "#4285f4",
        isPrimary: true,
      });

      expect(id).toBe(MOCK_UUID);
      expect(mockDb.execute).toHaveBeenCalledOnce();
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO calendars"),
        [MOCK_UUID, "acc-1", "google", "remote-cal-1", "My Calendar", "#4285f4", 1],
      );
    });

    it("updates on conflict and returns existing id", async () => {
      const existingId = "existing-id-123";
      // selectFirstBy returns the existing row id (conflict path)
      mockDb.select.mockResolvedValueOnce([{ id: existingId }]);

      const id = await upsertCalendar({
        accountId: "acc-1",
        provider: "google",
        remoteId: "remote-cal-1",
        displayName: "Updated Name",
        color: "#0b8043",
        isPrimary: false,
      });

      expect(id).toBe(existingId);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("ON CONFLICT(account_id, remote_id) DO UPDATE"),
        [MOCK_UUID, "acc-1", "google", "remote-cal-1", "Updated Name", "#0b8043", 0],
      );
    });

    it("returns generated id when selectFirstBy finds no row", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      const id = await upsertCalendar({
        accountId: "acc-1",
        provider: "google",
        remoteId: "remote-cal-1",
        displayName: null,
        color: null,
        isPrimary: false,
      });

      expect(id).toBe(MOCK_UUID);
    });
  });

  describe("getCalendarsForAccount", () => {
    it("returns calendars for the given account", async () => {
      const calendars: DbCalendar[] = [
        makeCal({ id: "cal-1", account_id: "acc-1", is_primary: 1, display_name: "Primary" }),
        makeCal({ id: "cal-2", account_id: "acc-1", is_primary: 0, display_name: "Work" }),
      ];
      mockDb.select.mockResolvedValueOnce(calendars);

      const result = await getCalendarsForAccount("acc-1");

      expect(result).toEqual(calendars);
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE account_id = $1"),
        ["acc-1"],
      );
    });

    it("returns empty array when no calendars exist", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      const result = await getCalendarsForAccount("acc-none");

      expect(result).toEqual([]);
    });
  });

  describe("getVisibleCalendars", () => {
    it("only returns visible calendars", async () => {
      const visible = [makeCal({ id: "cal-1", is_visible: 1 })];
      mockDb.select.mockResolvedValueOnce(visible);

      const result = await getVisibleCalendars("acc-1");

      expect(result).toEqual(visible);
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("AND is_visible = 1"),
        ["acc-1"],
      );
    });
  });

  describe("setCalendarVisibility", () => {
    it("sets visibility to true", async () => {
      await setCalendarVisibility("cal-1", true);

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE calendars SET is_visible = $1"),
        [1, "cal-1"],
      );
    });

    it("sets visibility to false", async () => {
      await setCalendarVisibility("cal-1", false);

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE calendars SET is_visible = $1"),
        [0, "cal-1"],
      );
    });
  });

  describe("updateCalendarSyncToken", () => {
    it("updates sync_token and ctag", async () => {
      await updateCalendarSyncToken("cal-1", "sync-abc", "ctag-xyz");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE calendars SET sync_token = $1, ctag = $2"),
        ["sync-abc", "ctag-xyz", "cal-1"],
      );
    });

    it("sets ctag to null when not provided", async () => {
      await updateCalendarSyncToken("cal-1", "sync-abc");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE calendars SET sync_token = $1, ctag = $2"),
        ["sync-abc", null, "cal-1"],
      );
    });

    it("allows null sync_token", async () => {
      await updateCalendarSyncToken("cal-1", null, "ctag-xyz");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET sync_token = $1"),
        [null, "ctag-xyz", "cal-1"],
      );
    });
  });

  describe("deleteCalendarsForAccount", () => {
    it("deletes all calendars for the given account", async () => {
      await deleteCalendarsForAccount("acc-1");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM calendars WHERE account_id = $1"),
        ["acc-1"],
      );
    });
  });

  describe("getCalendarById", () => {
    it("returns the calendar when found", async () => {
      const cal = makeCal({ id: "cal-1" });
      mockDb.select.mockResolvedValueOnce([cal]);

      const result = await getCalendarById("cal-1");

      expect(result).toEqual(cal);
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1"),
        ["cal-1"],
      );
    });

    it("returns null when calendar not found", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      const result = await getCalendarById("nonexistent");

      expect(result).toBeNull();
    });
  });
});

function makeCal(overrides: Partial<DbCalendar> = {}): DbCalendar {
  return {
    id: "cal-default",
    account_id: "acc-1",
    provider: "google",
    remote_id: "remote-default",
    display_name: "Default Calendar",
    color: "#4285f4",
    is_primary: 0,
    is_visible: 1,
    sync_token: null,
    ctag: null,
    created_at: 1700000000,
    updated_at: 1700000000,
    ...overrides,
  };
}
