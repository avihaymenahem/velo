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
  type: "imap" as const,
  sendMessage: vi.fn().mockResolvedValue({ id: "sent-msg-1" }),
  archive: vi.fn(),
  trash: vi.fn(),
  permanentDelete: vi.fn(),
  markRead: vi.fn(),
  star: vi.fn(),
  spam: vi.fn(),
  moveToFolder: vi.fn(),
  addLabel: vi.fn(),
  removeLabel: vi.fn(),
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
    getState: vi.fn(() => ({ isOnline: true })),
  },
}));

vi.mock("@/stores/threadStore", () => ({
  useThreadStore: {
    getState: vi.fn(() => ({
      updateThread: vi.fn(),
      removeThread: vi.fn(),
      threads: [],
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

const mockClassifyError = vi.fn(() => ({ isRetryable: false, message: "Error" }));
vi.mock("@/utils/networkErrors", () => ({
  classifyError: (...args: unknown[]) => mockClassifyError(...args),
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: Send Email", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetDb } = await import("@/services/db/connection");
    resetDb();
    await runMigrations();
    await seedAccount();
  });

  afterEach(() => {
    db?.close();
  });

  describe("Test #5: Send email via SMTP provider", () => {
    it("calls sendMessage on provider and does not leave pending_operations on success", async () => {
      const { sendEmail } = await import("@/services/emailActions");
      const rawBase64 = btoa("To: recipient@example.com\r\nSubject: Test\r\n\r\nHello");

      const result = await sendEmail(getTestAccountId(), rawBase64, "thread-1");

      expect(result.success).toBe(true);
      expect(mockProvider.sendMessage).toHaveBeenCalledWith(rawBase64, "thread-1");

      const pendingOps = await db!.select<{ id: string; operation_type: string; status: string }[]>(
        "SELECT id, operation_type, status FROM pending_operations WHERE account_id = $1",
        [getTestAccountId()],
      );
      expect(pendingOps).toHaveLength(0);
    });

    it("queues pending_operation when provider errors with retryable error", async () => {
      mockProvider.sendMessage.mockRejectedValueOnce(new Error("Failed to fetch"));
      mockClassifyError.mockReturnValueOnce({ isRetryable: true, message: "Network error" });

      const { sendEmail } = await import("@/services/emailActions");
      const rawBase64 = btoa("To: recipient@example.com\r\nSubject: Test\r\n\r\nHello");

      const result = await sendEmail(getTestAccountId(), rawBase64);

      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);

      const pendingOps = await db!.select<{ id: string; operation_type: string; status: string }[]>(
        "SELECT id, operation_type, status FROM pending_operations WHERE account_id = $1",
        [getTestAccountId()],
      );
      expect(pendingOps.length).toBeGreaterThanOrEqual(1);
      expect(pendingOps[0]!.operation_type).toBe("sendMessage");
      expect(pendingOps[0]!.status).toBe("pending");
    });
  });
});
