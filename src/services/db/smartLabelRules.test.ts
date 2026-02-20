import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: mockGetDb,
    buildDynamicUpdate: vi.fn(),
  };
});

import { getDb, buildDynamicUpdate } from "@/services/db/connection";
import {
  getSmartLabelRulesForAccount,
  getEnabledSmartLabelRules,
  insertSmartLabelRule,
  updateSmartLabelRule,
  deleteSmartLabelRule,
} from "./smartLabelRules";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("smartLabelRules service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(
      mockDb as unknown as Awaited<ReturnType<typeof getDb>>,
    );
  });

  describe("getSmartLabelRulesForAccount", () => {
    it("returns rules for the account ordered by sort_order", async () => {
      const mockRules = [
        { id: "r1", account_id: "acc-1", label_id: "l1", ai_description: "Test", criteria_json: null, is_enabled: 1, sort_order: 0, created_at: 100 },
      ];
      mockDb.select.mockResolvedValueOnce(mockRules);

      const result = await getSmartLabelRulesForAccount("acc-1");

      expect(result).toEqual(mockRules);
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("WHERE account_id = $1"),
        ["acc-1"],
      );
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY sort_order"),
        expect.anything(),
      );
    });
  });

  describe("getEnabledSmartLabelRules", () => {
    it("returns only enabled rules", async () => {
      await getEnabledSmartLabelRules("acc-1");

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("is_enabled = 1"),
        ["acc-1"],
      );
    });
  });

  describe("insertSmartLabelRule", () => {
    it("inserts with required fields", async () => {
      const id = await insertSmartLabelRule({
        accountId: "acc-1",
        labelId: "label-1",
        aiDescription: "Job applications",
      });

      expect(id).toBeTruthy();
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO smart_label_rules"),
        expect.arrayContaining(["acc-1", "label-1", "Job applications", null, 1]),
      );
    });

    it("inserts with optional criteria", async () => {
      await insertSmartLabelRule({
        accountId: "acc-1",
        labelId: "label-1",
        aiDescription: "Job apps",
        criteria: { from: "recruiter@", subject: "position" },
      });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO smart_label_rules"),
        expect.arrayContaining([
          JSON.stringify({ from: "recruiter@", subject: "position" }),
        ]),
      );
    });

    it("inserts as disabled when isEnabled is false", async () => {
      await insertSmartLabelRule({
        accountId: "acc-1",
        labelId: "label-1",
        aiDescription: "Test",
        isEnabled: false,
      });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO smart_label_rules"),
        expect.arrayContaining([0]),
      );
    });
  });

  describe("updateSmartLabelRule", () => {
    it("delegates to buildDynamicUpdate", async () => {
      vi.mocked(buildDynamicUpdate).mockReturnValue({
        sql: "UPDATE smart_label_rules SET ai_description = $1 WHERE id = $2",
        params: ["Updated description", "r1"],
      });

      await updateSmartLabelRule("r1", { aiDescription: "Updated description" });

      expect(buildDynamicUpdate).toHaveBeenCalledWith(
        "smart_label_rules",
        "id",
        "r1",
        [["ai_description", "Updated description"]],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        "UPDATE smart_label_rules SET ai_description = $1 WHERE id = $2",
        ["Updated description", "r1"],
      );
    });

    it("does nothing when no updates provided", async () => {
      vi.mocked(buildDynamicUpdate).mockReturnValue(null);

      await updateSmartLabelRule("r1", {});

      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it("serializes criteria to JSON", async () => {
      vi.mocked(buildDynamicUpdate).mockReturnValue({
        sql: "UPDATE ...",
        params: [],
      });

      await updateSmartLabelRule("r1", {
        criteria: { from: "test@example.com" },
      });

      expect(buildDynamicUpdate).toHaveBeenCalledWith(
        "smart_label_rules",
        "id",
        "r1",
        [["criteria_json", JSON.stringify({ from: "test@example.com" })]],
      );
    });

    it("clears criteria when set to null", async () => {
      vi.mocked(buildDynamicUpdate).mockReturnValue({
        sql: "UPDATE ...",
        params: [],
      });

      await updateSmartLabelRule("r1", { criteria: null });

      expect(buildDynamicUpdate).toHaveBeenCalledWith(
        "smart_label_rules",
        "id",
        "r1",
        [["criteria_json", null]],
      );
    });
  });

  describe("deleteSmartLabelRule", () => {
    it("deletes by id", async () => {
      await deleteSmartLabelRule("r1");

      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM smart_label_rules WHERE id = $1",
        ["r1"],
      );
    });
  });
});
