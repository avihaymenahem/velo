import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { freshTestDb, runMigrations, getTestAccountId, seedAccount, MockTauriDb } from "./setup";

let db: MockTauriDb;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => {
      db = freshTestDb();
      return Promise.resolve(db);
    }),
  },
}));

const mockProvider = {
  accountId: getTestAccountId(),
  type: "gmail_api" as const,
  archive: vi.fn(),
  trash: vi.fn(),
  permanentDelete: vi.fn(),
  markRead: vi.fn(),
  star: vi.fn(),
  spam: vi.fn(),
  moveToFolder: vi.fn(),
  addLabel: vi.fn(),
  removeLabel: vi.fn(),
  sendMessage: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  deleteDraft: vi.fn(),
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  renameFolder: vi.fn(),
  initialSync: vi.fn(),
  deltaSync: vi.fn(),
  fetchMessage: vi.fn(),
  fetchAttachment: vi.fn(),
  fetchRawMessage: vi.fn(),
  testConnection: vi.fn(),
  getProfile: vi.fn(),
};

vi.mock("@/stores/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({ isOnline: false, setPendingOpsCount: vi.fn() })),
  },
}));

vi.mock("@/stores/threadStore", () => ({
  useThreadStore: {
    getState: vi.fn(() => ({
      updateThread: vi.fn(),
      removeThread: vi.fn(),
      threads: [{ id: "t1" }, { id: "t2" }],
    })),
  },
}));

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(() => Promise.resolve(mockProvider)),
}));

vi.mock("@/router/navigate", () => ({
  navigateToThread: vi.fn(),
  getSelectedThreadId: vi.fn(() => null),
}));

vi.mock("@/utils/networkErrors", () => ({
  classifyError: vi.fn(() => ({ isRetryable: false, message: "Error" })),
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: Offline Queue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useUIStore } = await import("@/stores/uiStore");
    vi.mocked(useUIStore.getState).mockReturnValue({ isOnline: false, setPendingOpsCount: vi.fn() } as never);
    const { resetDb } = await import("@/services/db/connection");
    resetDb();
    await runMigrations();
    await seedAccount();
  });

  afterEach(() => {
    db?.close();
  });

  describe("Test #7: Offline queue — archive thread", () => {
    it("creates pending_operation when offline and does NOT call provider", async () => {
      const { archiveThread } = await import("@/services/emailActions");

      const result = await archiveThread(getTestAccountId(), "t1", ["m1"]);

      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(mockProvider.archive).not.toHaveBeenCalled();

      const pendingOps = await db!.select<{ operation_type: string; resource_id: string; status: string; params: string }[]>(
        "SELECT operation_type, resource_id, status, params FROM pending_operations WHERE account_id = $1",
        [getTestAccountId()],
      );
      expect(pendingOps).toHaveLength(1);
      expect(pendingOps[0]!.operation_type).toBe("archive");
      expect(pendingOps[0]!.resource_id).toBe("t1");
      expect(pendingOps[0]!.status).toBe("pending");
    });

    it("processes pending operations via triggerQueueFlush", async () => {
      const { archiveThread } = await import("@/services/emailActions");

      await archiveThread(getTestAccountId(), "t1", ["m1"]);

      let pendingOps = await db!.select<{ id: string }[]>(
        "SELECT id FROM pending_operations WHERE account_id = $1 AND status = 'pending'",
        [getTestAccountId()],
      );
      expect(pendingOps).toHaveLength(1);

      const op = pendingOps[0]!;

      const { useUIStore } = await import("@/stores/uiStore");
      vi.mocked(useUIStore.getState).mockReturnValue({ isOnline: true, setPendingOpsCount: vi.fn() } as never);

      const { triggerQueueFlush } = await import("@/services/queue/queueProcessor");
      await triggerQueueFlush();

      const remaining = await db!.select<{ id: string }[]>(
        "SELECT id FROM pending_operations WHERE id = $1",
        [op.id],
      );
      expect(remaining).toHaveLength(0);
    });

    it("compacts redundant operations before processing", async () => {
      const { starThread } = await import("@/services/emailActions");

      await starThread(getTestAccountId(), "t1", ["m1"], true);
      await starThread(getTestAccountId(), "t1", ["m1"], false);

      let pendingOps = await db!.select<{ id: string }[]>(
        "SELECT id FROM pending_operations WHERE account_id = $1 AND status = 'pending'",
        [getTestAccountId()],
      );
      expect(pendingOps).toHaveLength(2);

      const { compactQueue } = await import("@/services/db/pendingOperations");
      const removed = await compactQueue(getTestAccountId());
      expect(removed).toBe(2);

      pendingOps = await db!.select<{ id: string }[]>(
        "SELECT id FROM pending_operations WHERE account_id = $1 AND status = 'pending'",
        [getTestAccountId()],
      );
      expect(pendingOps).toHaveLength(0);
    });
  });
});
