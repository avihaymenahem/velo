import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { getBundleSummaries } from "./bundleRules";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("bundleRules service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getBundleSummaries", () => {
    it("returns empty map for empty categories", async () => {
      const result = await getBundleSummaries("acc-1", []);
      expect(result.size).toBe(0);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("fetches summaries for multiple categories in 2 queries", async () => {
      // First query: counts
      mockDb.select.mockResolvedValueOnce([
        { category: "Promotions", count: 5 },
        { category: "Social", count: 3 },
      ]);
      // Second query: latest
      mockDb.select.mockResolvedValueOnce([
        { category: "Promotions", subject: "Big Sale", from_name: "Store" },
        { category: "Social", subject: "New follower", from_name: "App" },
      ]);

      const result = await getBundleSummaries("acc-1", ["Promotions", "Social"]);

      expect(result.size).toBe(2);
      expect(result.get("Promotions")).toEqual({ count: 5, latestSubject: "Big Sale", latestSender: "Store" });
      expect(result.get("Social")).toEqual({ count: 3, latestSubject: "New follower", latestSender: "App" });
      // Only 2 queries, not 2N
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("returns zero counts for categories with no threads", async () => {
      mockDb.select.mockResolvedValueOnce([]);
      mockDb.select.mockResolvedValueOnce([]);

      const result = await getBundleSummaries("acc-1", ["Empty"]);

      expect(result.get("Empty")).toEqual({ count: 0, latestSubject: null, latestSender: null });
    });
  });
});
