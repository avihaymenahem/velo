import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockDb } from "@/test/mocks";
import * as warmingDb from "@/services/db/warming";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(() => Promise.resolve(createMockDb())),
    queryWithRetry: vi.fn((fn: (db: unknown) => unknown) => {
      const db = createMockDb();
      return fn(db);
    }),
    selectFirstBy: vi.fn(),
  };
});

vi.mock("@/services/db/warming", () => ({
  getWarmingPlan: vi.fn(),
  upsertWarmingPlan: vi.fn(),
  logWarmingVolume: vi.fn(),
}));

describe("warmingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDailyLimit", () => {
    it("returns Infinity when warming is disabled", async () => {
      vi.mocked(warmingDb.getWarmingPlan).mockResolvedValue(null);

      const { getDailyLimit } = await import("@/services/deliverability/warmingService");
      const result = await getDailyLimit("acc-1");
      expect(result).toBe(Infinity);
    });

    it("returns current_volume when warming is enabled", async () => {
      vi.mocked(warmingDb.getWarmingPlan).mockResolvedValue({
        id: "w1",
        account_id: "acc-1",
        enabled: 1,
        start_volume: 10,
        current_volume: 25,
        target_volume: 100,
        ramp_days: 14,
        created_at: Math.floor(Date.now() / 1000) - 86400 * 5,
        updated_at: Math.floor(Date.now() / 1000),
      });

      const { getDailyLimit } = await import("@/services/deliverability/warmingService");
      const result = await getDailyLimit("acc-1");
      expect(result).toBe(25);
    });
  });

  describe("getWarmingProgress", () => {
    it("returns null when no plan exists", async () => {
      vi.mocked(warmingDb.getWarmingPlan).mockResolvedValue(null);

      const { getWarmingProgress } = await import("@/services/deliverability/warmingService");
      const result = await getWarmingProgress("acc-1");
      expect(result).toBeNull();
    });

    it("computes progress correctly", async () => {
      const createdAt = Math.floor(Date.now() / 1000) - 86400 * 7;
      vi.mocked(warmingDb.getWarmingPlan).mockResolvedValue({
        id: "w1",
        account_id: "acc-1",
        enabled: 1,
        start_volume: 10,
        current_volume: 55,
        target_volume: 100,
        ramp_days: 14,
        created_at: createdAt,
        updated_at: Math.floor(Date.now() / 1000),
      });

      const { getWarmingProgress } = await import("@/services/deliverability/warmingService");
      const result = await getWarmingProgress("acc-1");
      expect(result).not.toBeNull();
      expect(result!.currentVolume).toBe(55);
      expect(result!.targetVolume).toBe(100);
      expect(result!.totalDays).toBe(14);
      expect(result!.percentageComplete).toBeCloseTo(50, 0);
    });
  });

  describe("enableWarming", () => {
    it("creates a new plan with defaults", async () => {
      vi.mocked(warmingDb.getWarmingPlan).mockResolvedValue(null);

      const { enableWarming } = await import("@/services/deliverability/warmingService");
      await enableWarming("acc-1");

      expect(warmingDb.upsertWarmingPlan).toHaveBeenCalledWith("acc-1", {
        enabled: 1,
        start_volume: 10,
        current_volume: 10,
        target_volume: 100,
        ramp_days: 14,
      });
    });
  });
});
