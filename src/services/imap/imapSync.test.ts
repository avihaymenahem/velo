import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() calls are hoisted — must use inline factories, not external references
vi.mock("./tauriCommands", () => ({
  imapListFolders: vi.fn(),
  imapGetFolderStatus: vi.fn(),
  imapFetchMessages: vi.fn(),
  imapFetchNewUids: vi.fn(),
  imapSearchAllUids: vi.fn(),
  imapSearchFolder: vi.fn(),
  imapDeltaCheck: vi.fn(),
  // Rust-backed fetch+store and thread finalization (the streaming sync path).
  imapFetchAndStore: vi.fn(),
  imapStoreThreads: vi.fn(async () => 0),
}));
vi.mock("./imapConfigBuilder", () => ({
  buildImapConfig: vi.fn(() => ({
    host: "imap.example.com",
    port: 993,
    security: "ssl",
    username: "user@example.com",
    password: "secret",
    auth_method: "password",
  })),
}));
vi.mock("./folderMapper", () => ({
  mapFolderToLabel: vi.fn((folder: { path: string }) => ({
    labelId: folder.path,
    labelName: folder.path,
    type: "user",
  })),
  getLabelsForMessage: vi.fn(
    (mapping: { labelId: string }, isRead: boolean, isStarred: boolean) => {
      const labels = [mapping.labelId];
      if (!isRead) labels.push("UNREAD");
      if (isStarred) labels.push("STARRED");
      return labels;
    },
  ),
  syncFoldersToLabels: vi.fn(),
  getSyncableFolders: vi.fn((folders: unknown[]) => folders),
}));
vi.mock("../db/messages", () => ({
  upsertMessage: vi.fn(),
  updateMessageThreadIds: vi.fn(),
}));
vi.mock("../db/threads", () => ({
  upsertThread: vi.fn(),
  setThreadLabels: vi.fn(),
  deleteThread: vi.fn(),
  recalculateThreadStats: vi.fn(),
  getThreadSubjectMap: vi.fn(async () => new Map()),
}));
vi.mock("../db/attachments", () => ({
  upsertAttachment: vi.fn(),
}));
vi.mock("../db/accounts", () => ({
  getAccount: vi.fn(),
  updateAccountSyncState: vi.fn(),
}));
vi.mock("../db/connection", () => ({
  withTransaction: vi.fn(async (fn: () => Promise<void>) => fn()),
  // mergeGroupsByRfcId / getThreadsWithExternalSenders query the DB directly; with no
  // real DB return no rows so threading proceeds on the in-memory groups alone.
  getDb: vi.fn(async () => ({
    select: vi.fn(async () => []),
    execute: vi.fn(async () => ({ rowsAffected: 0 })),
  })),
}));
vi.mock("../db/folderSyncState", () => ({
  upsertFolderSyncState: vi.fn(),
  getAllFolderSyncStates: vi.fn(),
}));
vi.mock("../db/pendingOperations", () => ({
  getPendingOpsForResource: vi.fn(() => []),
  getPendingOpResourceIds: vi.fn(async () => new Set()),
}));
vi.mock("@/services/ai/urgencyPipeline", () => ({
  processThreadUrgency: vi.fn(async () => {}),
}));

import { imapInitialSync, formatImapDate, computeSinceDate, isConnectionError } from "./imapSync";
import {
  createMockImapAccount,
  createMockImapFolder,
  createMockImapFolderStatus,
} from "@/test/mocks";
import type { ImapSyncHeader } from "./tauriCommands";
import { imapListFolders, imapSearchFolder, imapFetchAndStore, imapStoreThreads } from "./tauriCommands";
import { getAccount } from "../db/accounts";

describe("imapInitialSync", () => {
  const mockGetAccount = vi.mocked(getAccount);
  const mockImapListFolders = vi.mocked(imapListFolders);
  const mockImapSearchFolder = vi.mocked(imapSearchFolder);
  const mockImapFetchAndStore = vi.mocked(imapFetchAndStore);
  const mockImapStoreThreads = vi.mocked(imapStoreThreads);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetAccount.mockResolvedValue(createMockImapAccount({ id: "acc-1" }));
    mockImapStoreThreads.mockResolvedValue(0);
  });

  afterEach(() => {
    mockImapSearchFolder.mockReset();
    mockImapFetchAndStore.mockReset();
    mockImapListFolders.mockReset();
    vi.useRealTimers();
  });

  /** Build an ImapSyncHeader as returned by the Rust imap_fetch_and_store command. */
  function makeHeader(uid: number, overrides: Partial<ImapSyncHeader> = {}): ImapSyncHeader {
    return {
      local_id: `imap-acc-1-INBOX-${uid}`,
      uid,
      message_id: `<m${uid}@test>`,
      in_reply_to: null,
      references: null,
      subject: `Subject ${uid}`,
      date: Math.floor(Date.now() / 1000),
      label_id: "INBOX",
      is_read: true,
      is_starred: false,
      is_draft: false,
      has_attachments: false,
      snippet: "snippet",
      from_address: "sender@test.com",
      from_name: "Sender",
      stored: true,
      ...overrides,
    };
  }

  /**
   * Configure mocks for a single folder: imapSearchFolder returns the UIDs and
   * imap_fetch_and_store returns the corresponding headers (Rust already wrote the
   * messages/attachments to SQLite, so it only returns header slices for threading).
   */
  function setupFolder(folder: string, headers: ImapSyncHeader[]) {
    const mockFolder = createMockImapFolder({ path: folder, raw_path: folder, exists: headers.length });
    mockImapListFolders.mockResolvedValue([mockFolder]);
    mockImapSearchFolder.mockResolvedValue({
      uids: headers.map((h) => h.uid),
      folder_status: createMockImapFolderStatus({ exists: headers.length }),
    });
    mockImapFetchAndStore.mockResolvedValue(headers);
  }

  /** Run a sync to completion, flushing the internal inter-batch/inter-folder delays. */
  async function runSync(daysBack = 365, onProgress?: Parameters<typeof imapInitialSync>[2]) {
    const p = imapInitialSync("acc-1", daysBack, onProgress);
    await vi.runAllTimersAsync();
    return p;
  }

  it("fetches + stores messages per folder via imap_fetch_and_store", async () => {
    setupFolder("INBOX", [makeHeader(1), makeHeader(2)]);

    await runSync();

    // Rust does the IMAP fetch + DB write in one call; TS no longer upserts per-message.
    expect(mockImapFetchAndStore).toHaveBeenCalledTimes(1);
    expect(mockImapFetchAndStore).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com" }),
      "acc-1",
      "INBOX",
      "INBOX",
      [1, 2],
      expect.any(Number),
    );
  });

  it("returns an empty messages array (bodies are stored by Rust, not accumulated)", async () => {
    setupFolder("INBOX", [makeHeader(1)]);

    const result = await runSync();

    expect(result.messages).toEqual([]);
  });

  it("finalizes threads via imap_store_threads", async () => {
    setupFolder("INBOX", [makeHeader(1), makeHeader(2)]);

    await runSync();

    expect(mockImapStoreThreads).toHaveBeenCalledTimes(1);
    const [accountId, updates, allLocalIds] = mockImapStoreThreads.mock.calls[0]!;
    expect(accountId).toBe("acc-1");
    expect(updates.length).toBeGreaterThan(0);
    expect(allLocalIds).toEqual(
      expect.arrayContaining(["imap-acc-1-INBOX-1", "imap-acc-1-INBOX-2"]),
    );
  });

  it("passes a date cutoff to imap_fetch_and_store when daysBack > 0", async () => {
    setupFolder("INBOX", [makeHeader(1)]);

    await runSync(365);

    const cutoff = mockImapFetchAndStore.mock.calls[0]![5];
    expect(cutoff).toBeGreaterThan(0);
  });

  it("handles empty folders gracefully", async () => {
    const mockFolder = createMockImapFolder({ path: "INBOX", raw_path: "INBOX", exists: 0 });
    mockImapListFolders.mockResolvedValue([mockFolder]);

    const result = await runSync();

    expect(mockImapSearchFolder).not.toHaveBeenCalled();
    expect(mockImapFetchAndStore).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
  });

  it("reports progress through all phases", async () => {
    setupFolder("INBOX", [makeHeader(1)]);

    const phases: string[] = [];
    await runSync(365, (progress) => phases.push(progress.phase));

    expect(phases).toContain("folders");
    expect(phases).toContain("messages");
    expect(phases).toContain("threading");
    expect(phases).toContain("storing_threads");
    expect(phases).toContain("done");
  });

  it("uses imapSearchFolder with a SINCE date filter", async () => {
    setupFolder("INBOX", [makeHeader(1)]);

    await runSync();

    expect(mockImapSearchFolder).toHaveBeenCalledTimes(1);
    expect(mockImapSearchFolder).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com" }),
      "INBOX",
      expect.stringMatching(/^\d{1,2}-[A-Z][a-z]{2}-\d{4}$/),
    );
  });

  it("continues after a folder fetch error when another folder succeeds", async () => {
    const folders = [
      createMockImapFolder({ path: "f1", raw_path: "f1", exists: 1 }),
      createMockImapFolder({ path: "f2", raw_path: "f2", exists: 1 }),
    ];
    mockImapListFolders.mockResolvedValue(folders);
    mockImapSearchFolder.mockResolvedValue({
      uids: [1],
      folder_status: createMockImapFolderStatus({ exists: 1 }),
    });
    // First folder's fetch fails (non-connection error), second succeeds.
    mockImapFetchAndStore
      .mockRejectedValueOnce(new Error("PARSE failed"))
      .mockResolvedValueOnce([makeHeader(1)]);

    const result = await runSync();

    // Folder error is swallowed; the successful folder still gets its threads stored.
    expect(result.messages).toEqual([]);
    expect(mockImapStoreThreads).toHaveBeenCalledTimes(1);
  });

  it("circuit breaker skips remaining folders after 5 consecutive connection failures", async () => {
    const folders = Array.from({ length: 8 }, (_, i) =>
      createMockImapFolder({ path: `folder-${i}`, raw_path: `folder-${i}`, exists: 10 }),
    );
    mockImapListFolders.mockResolvedValue(folders);
    mockImapSearchFolder.mockRejectedValue(new Error("TCP connect timed out (os error 60)"));

    let caughtError: Error | null = null;
    const syncPromise = imapInitialSync("acc-1").catch((err: Error) => {
      caughtError = err;
    });
    await vi.runAllTimersAsync();
    await syncPromise;

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain("All folders failed to sync");
    expect(mockImapSearchFolder).toHaveBeenCalledTimes(5);
  });

  it("circuit breaker resets on successful folder sync", async () => {
    const folders = [
      createMockImapFolder({ path: "f1", raw_path: "f1", exists: 10 }),
      createMockImapFolder({ path: "f2", raw_path: "f2", exists: 10 }),
      createMockImapFolder({ path: "f3", raw_path: "f3", exists: 10 }),
      createMockImapFolder({ path: "f4", raw_path: "f4", exists: 10 }),
    ];
    mockImapListFolders.mockResolvedValue(folders);

    // First 2 fail with connection error, 3rd succeeds, 4th fails.
    mockImapSearchFolder
      .mockRejectedValueOnce(new Error("TCP connect timed out"))
      .mockRejectedValueOnce(new Error("TCP connect timed out"))
      .mockResolvedValueOnce({
        uids: [1],
        folder_status: createMockImapFolderStatus({ exists: 1 }),
      })
      .mockRejectedValueOnce(new Error("TCP connect timed out"));
    mockImapFetchAndStore.mockResolvedValue([makeHeader(1, { label_id: "f3", local_id: "imap-acc-1-f3-1" })]);

    const syncPromise = imapInitialSync("acc-1");
    await vi.runAllTimersAsync();
    await syncPromise;

    // All 4 folders attempted (breaker reset after the success on f3).
    expect(mockImapSearchFolder).toHaveBeenCalledTimes(4);
  });

  it("continues on non-connection errors without triggering circuit breaker", async () => {
    const folders = Array.from({ length: 6 }, (_, i) =>
      createMockImapFolder({ path: `folder-${i}`, raw_path: `folder-${i}`, exists: 10 }),
    );
    mockImapListFolders.mockResolvedValue(folders);
    mockImapSearchFolder.mockRejectedValue(new Error("PARSE failed: invalid response"));

    let caughtError: Error | null = null;
    const syncPromise = imapInitialSync("acc-1").catch((err: Error) => {
      caughtError = err;
    });
    await vi.runAllTimersAsync();
    await syncPromise;

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain("All folders failed to sync");
    expect(mockImapSearchFolder).toHaveBeenCalledTimes(6);
  });
});

describe("formatImapDate", () => {
  it("formats a date as DD-Mon-YYYY for IMAP SINCE criterion", () => {
    // 2024-03-15 UTC
    const date = new Date(Date.UTC(2024, 2, 15));
    expect(formatImapDate(date)).toBe("15-Mar-2024");
  });

  it("handles single-digit days without zero-padding", () => {
    const date = new Date(Date.UTC(2024, 0, 5));
    expect(formatImapDate(date)).toBe("5-Jan-2024");
  });

  it("handles December correctly", () => {
    const date = new Date(Date.UTC(2024, 11, 31));
    expect(formatImapDate(date)).toBe("31-Dec-2024");
  });
});

describe("computeSinceDate", () => {
  it("returns a date daysBack+1 days ago in DD-Mon-YYYY format", () => {
    const result = computeSinceDate(365);
    // Should match DD-Mon-YYYY format
    expect(result).toMatch(/^\d{1,2}-[A-Z][a-z]{2}-\d{4}$/);
  });

  it("adds 1-day safety margin", () => {
    // For daysBack=0, should still go back 1 day
    const result = computeSinceDate(0);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    expect(result).toBe(formatImapDate(yesterday));
  });
});

describe("isConnectionError", () => {
  it("detects 'timed out' errors", () => {
    expect(isConnectionError("TCP connect timed out (os error 60)")).toBe(true);
  });

  it("detects 'connection' errors", () => {
    expect(isConnectionError("connection reset by peer")).toBe(true);
  });

  it("detects TLS errors", () => {
    expect(isConnectionError("tls handshake failed")).toBe(true);
  });

  it("detects DNS errors", () => {
    expect(isConnectionError("dns resolution failed")).toBe(true);
  });

  it("detects ECONNREFUSED errors", () => {
    expect(isConnectionError("connect ECONNREFUSED 127.0.0.1:993")).toBe(true);
  });

  it("detects socket errors", () => {
    expect(isConnectionError("socket hang up")).toBe(true);
  });

  it("detects network errors", () => {
    expect(isConnectionError("network is unreachable")).toBe(true);
  });

  it("returns false for non-connection errors", () => {
    expect(isConnectionError("PARSE failed: invalid response")).toBe(false);
    expect(isConnectionError("authentication failed")).toBe(false);
  });
});

describe("imapInitialSync — all-folders-fail propagation", () => {
  const mockGetAccount = vi.mocked(getAccount);
  const mockImapListFolders = vi.mocked(imapListFolders);
  const mockImapSearchFolder = vi.mocked(imapSearchFolder);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetAccount.mockResolvedValue(createMockImapAccount({ id: "acc-1" }));
  });

  afterEach(() => {
    // Reset search mock implementation to prevent leaking into subsequent tests
    mockImapSearchFolder.mockReset();
    vi.useRealTimers();
  });

  it("throws when all folders fail and no messages were stored", async () => {
    const folders = [
      createMockImapFolder({ path: "INBOX", raw_path: "INBOX", exists: 10 }),
      createMockImapFolder({ path: "Sent", raw_path: "Sent", exists: 5 }),
    ];
    mockImapListFolders.mockResolvedValue(folders);
    mockImapSearchFolder.mockRejectedValue("authentication failed");

    let caughtError: Error | null = null;
    const syncPromise = imapInitialSync("acc-1").catch((err: Error) => {
      caughtError = err;
    });
    await vi.runAllTimersAsync();
    await syncPromise;

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain("All folders failed to sync");
  });
});
