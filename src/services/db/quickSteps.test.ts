import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
    buildDynamicUpdate: vi.fn(),
  };
});

import { getDb, buildDynamicUpdate } from "@/services/db/connection";
import {
  getQuickStepsForAccount,
  getEnabledQuickStepsForAccount,
  insertQuickStep,
  updateQuickStep,
  deleteQuickStep,
  reorderQuickSteps,
} from "./quickSteps";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("quickSteps DB service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(
      mockDb as unknown as Awaited<ReturnType<typeof getDb>>,
    );
    vi.mocked(buildDynamicUpdate).mockReturnValue(null);
  });

  describe("getQuickStepsForAccount", () => {
    it("queries all quick steps for an account ordered by sort_order", async () => {
      await getQuickStepsForAccount("acct-1");

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM quick_steps WHERE account_id = $1"),
        ["acct-1"],
      );
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY sort_order, created_at"),
        expect.anything(),
      );
    });
  });

  describe("getEnabledQuickStepsForAccount", () => {
    it("queries only enabled quick steps", async () => {
      await getEnabledQuickStepsForAccount("acct-1");

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("is_enabled = 1"),
        ["acct-1"],
      );
    });
  });

  describe("insertQuickStep", () => {
    it("inserts a quick step with serialized actions JSON", async () => {
      const actions = [{ type: "archive" as const }, { type: "markRead" as const }];

      const id = await insertQuickStep({
        accountId: "acct-1",
        name: "Test Step",
        actions,
      });

      expect(id).toBeTruthy();
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO quick_steps"),
        expect.arrayContaining([
          expect.any(String), // id
          "acct-1",
          "Test Step",
          null, // description
          null, // shortcut
          JSON.stringify(actions),
          null, // icon
          1, // is_enabled
          0, // continue_on_error
        ]),
      );
    });

    it("passes optional fields when provided", async () => {
      await insertQuickStep({
        accountId: "acct-1",
        name: "Custom Step",
        description: "A test description",
        shortcut: "Ctrl+1",
        actions: [{ type: "star" as const }],
        icon: "Star",
        isEnabled: false,
        continueOnError: true,
      });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO quick_steps"),
        expect.arrayContaining([
          "A test description",
          "Ctrl+1",
          "Star",
          0, // isEnabled = false
          1, // continueOnError = true
        ]),
      );
    });
  });

  describe("updateQuickStep", () => {
    it("calls buildDynamicUpdate with mapped fields", async () => {
      const actions = [{ type: "trash" as const }];
      vi.mocked(buildDynamicUpdate).mockReturnValue({
        sql: "UPDATE quick_steps SET name = $1 WHERE id = $2",
        params: ["New Name", "qs-1"],
      });

      await updateQuickStep("qs-1", {
        name: "New Name",
        actions,
        isEnabled: true,
        continueOnError: false,
      });

      expect(buildDynamicUpdate).toHaveBeenCalledWith(
        "quick_steps",
        "id",
        "qs-1",
        expect.arrayContaining([
          ["name", "New Name"],
          ["actions_json", JSON.stringify(actions)],
          ["is_enabled", 1],
          ["continue_on_error", 0],
        ]),
      );
      expect(mockDb.execute).toHaveBeenCalled();
    });

    it("does not call execute when no fields to update", async () => {
      vi.mocked(buildDynamicUpdate).mockReturnValue(null);

      await updateQuickStep("qs-1", {});

      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });

  describe("deleteQuickStep", () => {
    it("deletes by id", async () => {
      await deleteQuickStep("qs-1");

      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM quick_steps WHERE id = $1",
        ["qs-1"],
      );
    });
  });

  describe("reorderQuickSteps", () => {
    it("updates sort_order for each id in order", async () => {
      await reorderQuickSteps("acct-1", ["qs-b", "qs-a", "qs-c"]);

      expect(mockDb.execute).toHaveBeenCalledTimes(3);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE quick_steps SET sort_order = $1"),
        [0, "qs-b", "acct-1"],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE quick_steps SET sort_order = $1"),
        [1, "qs-a", "acct-1"],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE quick_steps SET sort_order = $1"),
        [2, "qs-c", "acct-1"],
      );
    });
  });
});
