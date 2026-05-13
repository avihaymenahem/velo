import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockDb } from "@/test/mocks";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    queryWithRetry: vi.fn((fn: (db: unknown) => unknown) => {
      const db = createMockDb();
      return fn(db);
    }),
    selectFirstBy: vi.fn(),
  };
});

describe("suppressionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSuppressed", () => {
    it("returns false when email is not suppressed", async () => {
      const { selectFirstBy } = await import("@/services/db/connection");
      vi.mocked(selectFirstBy).mockResolvedValue(null);

      const { isSuppressed } = await import("@/services/deliverability/suppressionList");
      const result = await isSuppressed("acc-1", "test@example.com");
      expect(result).toBe(false);
    });

    it("returns true when email is suppressed", async () => {
      const { selectFirstBy } = await import("@/services/db/connection");
      vi.mocked(selectFirstBy).mockResolvedValue({ count: 1 });

      const { isSuppressed } = await import("@/services/deliverability/suppressionList");
      const result = await isSuppressed("acc-1", "test@example.com");
      expect(result).toBe(true);
    });
  });

  describe("addToSuppression", () => {
    it("adds email to suppression list", async () => {
      const { addToSuppression } = await import("@/services/deliverability/suppressionList");
      await addToSuppression("acc-1", "test@example.com", "hard_bounce");

      const { queryWithRetry } = await import("@/services/db/connection");
      expect(queryWithRetry).toHaveBeenCalled();
    });
  });
});
