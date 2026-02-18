import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { updateLabelSortOrder } from "./labels";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("labels service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("updateLabelSortOrder", () => {
    it("executes all updates in parallel", async () => {
      const orders = [
        { id: "label-1", sortOrder: 0 },
        { id: "label-2", sortOrder: 1 },
        { id: "label-3", sortOrder: 2 },
      ];

      await updateLabelSortOrder("acc-1", orders);

      expect(mockDb.execute).toHaveBeenCalledTimes(3);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE labels SET sort_order"),
        [0, "acc-1", "label-1"],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE labels SET sort_order"),
        [2, "acc-1", "label-3"],
      );
    });

    it("handles empty array", async () => {
      await updateLabelSortOrder("acc-1", []);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });
});
