import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { getAllowlistedSenders } from "./imageAllowlist";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("imageAllowlist service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getAllowlistedSenders", () => {
    it("returns empty set for empty senders array", async () => {
      const result = await getAllowlistedSenders("acc-1", []);
      expect(result.size).toBe(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("returns set of allowlisted senders from batch query", async () => {
      mockDb.select.mockResolvedValueOnce([
        { sender_address: "alice@example.com" },
        { sender_address: "bob@example.com" },
      ]);

      const result = await getAllowlistedSenders("acc-1", [
        "alice@example.com",
        "bob@example.com",
        "carol@example.com",
      ]);

      expect(result.size).toBe(2);
      expect(result.has("alice@example.com")).toBe(true);
      expect(result.has("bob@example.com")).toBe(true);
      expect(result.has("carol@example.com")).toBe(false);
    });

    it("uses a single query with IN clause", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await getAllowlistedSenders("acc-1", ["a@example.com", "b@example.com"]);

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.select.mock.calls[0]!;
      expect(sql).toContain("IN");
      expect(params).toEqual(["acc-1", "a@example.com", "b@example.com"]);
    });
  });
});
