import {
  getFolderSyncState,
  upsertFolderSyncState,
  deleteFolderSyncState,
  getAllFolderSyncStates,
  type FolderSyncState,
} from "./folderSyncState";

const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock("./connection", () => ({
  getDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  })),
  selectFirstBy: vi.fn(),
}));

import { selectFirstBy } from "./connection";

const mockSelectFirstBy = vi.mocked(selectFirstBy);

describe("folderSyncState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getFolderSyncState", () => {
    it("returns null for non-existent folder sync state", async () => {
      mockSelectFirstBy.mockResolvedValue(null);

      const result = await getFolderSyncState("acc-1", "INBOX");

      expect(result).toBeNull();
      expect(mockSelectFirstBy).toHaveBeenCalledWith(
        "SELECT * FROM folder_sync_state WHERE account_id = $1 AND folder_path = $2",
        ["acc-1", "INBOX"],
      );
    });

    it("returns existing folder sync state", async () => {
      const state: FolderSyncState = {
        account_id: "acc-1",
        folder_path: "INBOX",
        uidvalidity: 12345,
        last_uid: 100,
        modseq: 999,
        last_sync_at: 1700000000,
      };
      mockSelectFirstBy.mockResolvedValue(state);

      const result = await getFolderSyncState("acc-1", "INBOX");

      expect(result).toEqual(state);
    });

    it("passes correct parameters for different folder paths", async () => {
      mockSelectFirstBy.mockResolvedValue(null);

      await getFolderSyncState("acc-2", "Sent");

      expect(mockSelectFirstBy).toHaveBeenCalledWith(
        expect.any(String),
        ["acc-2", "Sent"],
      );
    });
  });

  describe("upsertFolderSyncState", () => {
    it("creates new state via INSERT ON CONFLICT", async () => {
      mockExecute.mockResolvedValue(undefined);

      const state: FolderSyncState = {
        account_id: "acc-1",
        folder_path: "INBOX",
        uidvalidity: 12345,
        last_uid: 100,
        modseq: 999,
        last_sync_at: 1700000000,
      };

      await upsertFolderSyncState(state);

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO folder_sync_state");
      expect(sql).toContain("ON CONFLICT");
      expect(params).toEqual([
        "acc-1",
        "INBOX",
        12345,
        100,
        999,
        1700000000,
      ]);
    });

    it("handles null values for optional fields", async () => {
      mockExecute.mockResolvedValue(undefined);

      const state: FolderSyncState = {
        account_id: "acc-1",
        folder_path: "Drafts",
        uidvalidity: null,
        last_uid: 0,
        modseq: null,
        last_sync_at: null,
      };

      await upsertFolderSyncState(state);

      const [, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(params).toEqual(["acc-1", "Drafts", null, 0, null, null]);
    });

    it("updates existing state on conflict (upsert)", async () => {
      mockExecute.mockResolvedValue(undefined);

      // First insert
      const state1: FolderSyncState = {
        account_id: "acc-1",
        folder_path: "INBOX",
        uidvalidity: 12345,
        last_uid: 100,
        modseq: 999,
        last_sync_at: 1700000000,
      };
      await upsertFolderSyncState(state1);

      // Update same key
      const state2: FolderSyncState = {
        account_id: "acc-1",
        folder_path: "INBOX",
        uidvalidity: 12345,
        last_uid: 200,
        modseq: 1500,
        last_sync_at: 1700001000,
      };
      await upsertFolderSyncState(state2);

      expect(mockExecute).toHaveBeenCalledTimes(2);
      const [, params2] = mockExecute.mock.calls[1] as [string, unknown[]];
      expect(params2).toEqual([
        "acc-1",
        "INBOX",
        12345,
        200,
        1500,
        1700001000,
      ]);
    });
  });

  describe("deleteFolderSyncState", () => {
    it("deletes by account_id and folder_path", async () => {
      mockExecute.mockResolvedValue(undefined);

      await deleteFolderSyncState("acc-1", "INBOX");

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("DELETE FROM folder_sync_state");
      expect(params).toEqual(["acc-1", "INBOX"]);
    });

    it("uses correct SQL with both WHERE conditions", async () => {
      mockExecute.mockResolvedValue(undefined);

      await deleteFolderSyncState("acc-2", "Sent");

      const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("account_id = $1");
      expect(sql).toContain("folder_path = $2");
    });
  });

  describe("getAllFolderSyncStates", () => {
    it("returns all states for an account", async () => {
      const states: FolderSyncState[] = [
        {
          account_id: "acc-1",
          folder_path: "Drafts",
          uidvalidity: 111,
          last_uid: 10,
          modseq: null,
          last_sync_at: 1700000000,
        },
        {
          account_id: "acc-1",
          folder_path: "INBOX",
          uidvalidity: 222,
          last_uid: 50,
          modseq: 500,
          last_sync_at: 1700000000,
        },
        {
          account_id: "acc-1",
          folder_path: "Sent",
          uidvalidity: 333,
          last_uid: 30,
          modseq: null,
          last_sync_at: 1700000000,
        },
      ];
      mockSelect.mockResolvedValue(states);

      const result = await getAllFolderSyncStates("acc-1");

      expect(result).toEqual(states);
      expect(result).toHaveLength(3);
    });

    it("returns empty array when no states exist", async () => {
      mockSelect.mockResolvedValue([]);

      const result = await getAllFolderSyncStates("acc-nonexistent");

      expect(result).toEqual([]);
    });

    it("passes account_id and orders by folder_path ASC", async () => {
      mockSelect.mockResolvedValue([]);

      await getAllFolderSyncStates("acc-1");

      const [sql, params] = mockSelect.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("WHERE account_id = $1");
      expect(sql).toContain("ORDER BY folder_path ASC");
      expect(params).toEqual(["acc-1"]);
    });
  });
});
