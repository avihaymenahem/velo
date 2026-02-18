import {
  getWritingStyleProfile,
  upsertWritingStyleProfile,
  deleteWritingStyleProfile,
} from "./writingStyleProfiles";
import { getDb } from "./connection";

vi.mock("./connection", () => ({
  getDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue(mockDb as never);
});

describe("writingStyleProfiles", () => {
  describe("getWritingStyleProfile", () => {
    it("returns profile when found", async () => {
      const profile = {
        id: "p1",
        account_id: "acc1",
        profile_text: "Formal tone",
        sample_count: 10,
        created_at: 1000,
        updated_at: 1000,
      };
      mockDb.select.mockResolvedValue([profile]);

      const result = await getWritingStyleProfile("acc1");
      expect(result).toEqual(profile);
      expect(mockDb.select).toHaveBeenCalledWith(
        "SELECT * FROM writing_style_profiles WHERE account_id = $1",
        ["acc1"],
      );
    });

    it("returns null when not found", async () => {
      mockDb.select.mockResolvedValue([]);
      const result = await getWritingStyleProfile("acc1");
      expect(result).toBeNull();
    });
  });

  describe("upsertWritingStyleProfile", () => {
    it("inserts or updates a profile", async () => {
      await upsertWritingStyleProfile("acc1", "Casual tone", 15);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO writing_style_profiles"),
        expect.arrayContaining(["acc1", "Casual tone", 15]),
      );
    });
  });

  describe("deleteWritingStyleProfile", () => {
    it("deletes profile for account", async () => {
      await deleteWritingStyleProfile("acc1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM writing_style_profiles WHERE account_id = $1",
        ["acc1"],
      );
    });
  });
});
