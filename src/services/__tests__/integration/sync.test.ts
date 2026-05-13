import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { freshTestDb, runMigrations, getTestAccountId, seedAccount, getTestMessages, getTestThreads, MockTauriDb } from "./setup";

let db: MockTauriDb;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => {
      db = freshTestDb();
      return Promise.resolve(db);
    }),
  },
}));

const mockListLabels = vi.fn();
const mockListThreads = vi.fn();
const mockGetThread = vi.fn();

vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn(() => Promise.resolve({
    listLabels: mockListLabels,
    listThreads: mockListThreads,
    getThread: mockGetThread,
    modifyThread: vi.fn(),
    getHistory: vi.fn(),
    request: vi.fn(),
  })),
}));

vi.mock("@/services/gmail/client");

vi.mock("@/services/notifications/notificationManager", () => ({
  shouldNotifyForMessage: vi.fn(() => false),
  queueNewEmailNotification: vi.fn(),
}));

vi.mock("@/services/db/threadCategories", () => ({
  getThreadCategory: vi.fn(() => Promise.resolve(null)),
  getThreadCategoryWithManual: vi.fn(() => Promise.resolve(null)),
  setThreadCategory: vi.fn(),
}));

vi.mock("@/services/categorization/ruleEngine", () => ({
  categorizeByRules: vi.fn(() => "Primary"),
}));

vi.mock("@/services/db/bundleRules", () => ({
  getBundleRule: vi.fn(() => Promise.resolve(null)),
  holdThread: vi.fn(),
}));

vi.mock("@/services/smartLabels/smartLabelManager", () => ({
  applySmartLabelsToMessages: vi.fn(),
}));

const mockImapFetchMessages = vi.fn().mockResolvedValue({ messages: [], folder_status: { uidvalidity: 0, uidnext: 0, exists: 0, unseen: 0 } });
const mockImapListFolders = vi.fn().mockResolvedValue([]);
const mockImapGetFolderStatus = vi.fn().mockResolvedValue({ uidvalidity: 0, uidnext: 0, exists: 0, unseen: 0 });

vi.mock("@/services/imap/tauriCommands", () => ({
  imapListFolders: mockImapListFolders,
  imapFetchMessages: mockImapFetchMessages,
  imapGetFolderStatus: mockImapGetFolderStatus,
  imapSearchFolder: vi.fn().mockResolvedValue({ uids: [1, 2, 3], folder_status: { uidvalidity: 1, uidnext: 100, exists: 3, unseen: 3 } }),
  imapFetchMessageBodies: vi.fn().mockResolvedValue([]),
  imapAppendMessage: vi.fn(),
  imapAddFlags: vi.fn(),
  imapRemoveFlags: vi.fn(),
  imapCopyMessages: vi.fn(),
  imapDeleteMessages: vi.fn(),
  imapLogout: vi.fn(),
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: Sync", () => {
  vi.setConfig({ testTimeout: 15000 });
  beforeEach(async () => {
    vi.clearAllMocks();
    mockImapListFolders.mockResolvedValue([{ path: "INBOX", raw_path: "INBOX", name: "INBOX", delimiter: "/", special_use: null, exists: 0, unseen: 0 }]);
    mockImapFetchMessages.mockResolvedValue({ messages: [], folder_status: { uidvalidity: 0, uidnext: 0, exists: 0, unseen: 0 } });
    mockImapGetFolderStatus.mockResolvedValue({ uidvalidity: 0, uidnext: 0, exists: 0, unseen: 0 });
    const { resetDb } = await import("@/services/db/connection");
    resetDb();
    await runMigrations();
    await seedAccount();
  });

  afterEach(() => {
    db?.close();
  });

  describe("Test #3: Gmail full sync cycle", () => {
    it("syncs labels, threads, and messages into the DB", async () => {
      mockListLabels.mockResolvedValue({
        labels: [
          { id: "INBOX", name: "INBOX", type: "system", color: null },
          { id: "SENT", name: "SENT", type: "system", color: null },
        ],
      });

      mockListThreads.mockResolvedValueOnce({
        threads: [{ id: "thread-1" }, { id: "thread-2" }],
        nextPageToken: undefined,
      });

      mockGetThread
        .mockResolvedValueOnce({
          id: "thread-1",
          historyId: "100",
          messages: [
            {
              id: "msg-1",
              threadId: "thread-1",
              labelIds: ["INBOX", "UNREAD"],
              snippet: "Hello from Alice",
              historyId: "100",
              internalDate: "1700000000000",
              sizeEstimate: 500,
              payload: {
                partId: "",
                mimeType: "text/plain",
                filename: "",
                headers: [
                  { name: "From", value: "Alice <alice@example.com>" },
                  { name: "To", value: "bob@example.com" },
                  { name: "Subject", value: "Meeting tomorrow" },
                  { name: "Date", value: "Mon, 13 May 2026 10:00:00 +0000" },
                ],
                body: { size: 10, data: "SGVsbG8=" },
                parts: [],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          id: "thread-2",
          historyId: "101",
          messages: [
            {
              id: "msg-2",
              threadId: "thread-2",
              labelIds: ["INBOX"],
              snippet: "Re: Project update",
              historyId: "101",
              internalDate: "1700000000001",
              sizeEstimate: 600,
              payload: {
                partId: "",
                mimeType: "text/plain",
                filename: "",
                headers: [
                  { name: "From", value: "Bob <bob@example.com>" },
                  { name: "To", value: "alice@example.com" },
                  { name: "Subject", value: "Project update" },
                  { name: "Date", value: "Mon, 13 May 2026 11:00:00 +0000" },
                ],
                body: { size: 15, data: "SGVsbG8gV29ybGQ=" },
                parts: [],
              },
            },
          ],
        });

      const { syncLabels, initialSync } = await import("@/services/gmail/sync");
      const { getGmailClient } = await import("@/services/gmail/tokenManager");
      const client = await getGmailClient(getTestAccountId());

      await syncLabels(client, getTestAccountId());

      const labels = await db!.select<{ id: string; name: string }[]>(
        "SELECT id, name FROM labels WHERE account_id = $1 ORDER BY name",
        [getTestAccountId()],
      );
      expect(labels).toHaveLength(2);
      expect(labels[0]!.name).toBe("INBOX");
      expect(labels[1]!.name).toBe("SENT");

      await initialSync(client, getTestAccountId(), 365);

      const threads = await getTestThreads();
      expect(threads).toHaveLength(2);

      const messages = await getTestMessages();
      expect(messages).toHaveLength(2);

      const account = await (await import("@/services/db/accounts")).getAccount(getTestAccountId());
      expect(account!.history_id).toBe("101");
    });
  });

  describe("Test #4: IMAP full sync with JWZ threading", () => {
    let baseDate: number;

    beforeEach(async () => {
      await db!.execute(
        "UPDATE accounts SET provider = $1, imap_host = $2, imap_port = $3, imap_security = $4, smtp_host = $5, smtp_port = $6, smtp_security = $7, auth_method = $8 WHERE id = $9",
        ["imap", "imap.example.com", 993, "ssl", "smtp.example.com", 587, "starttls", "password", getTestAccountId()],
      );
      mockImapListFolders.mockResolvedValue([
        { path: "INBOX", raw_path: "INBOX", name: "INBOX", delimiter: "/", special_use: "\\Inbox", exists: 3, unseen: 3 },
      ]);
      mockImapGetFolderStatus.mockResolvedValue({
        uidvalidity: 1,
        uidnext: 100,
        exists: 3,
        unseen: 3,
      });
      baseDate = Date.now();
    });

    it("JWZ-threads IMAP messages using References/In-Reply-To headers", async () => {
      mockImapFetchMessages.mockResolvedValue({
        messages: [
          { uid: 1, folder: "INBOX", message_id: "<root@example.com>", in_reply_to: null, references: null, from_address: "alice@example.com", from_name: "Alice", to_addresses: "bob@example.com", subject: "Original thread", date: baseDate - 60000, is_read: false, is_starred: false, is_draft: false, body_html: null, body_text: "Starting a thread", snippet: "Starting a thread", raw_size: 200, attachments: [] },
          { uid: 2, folder: "INBOX", message_id: "<reply1@example.com>", in_reply_to: "<root@example.com>", references: "<root@example.com>", from_address: "bob@example.com", from_name: "Bob", to_addresses: "alice@example.com", subject: "Re: Original thread", date: baseDate - 30000, is_read: false, is_starred: false, is_draft: false, body_html: null, body_text: "Reply to thread", snippet: "Reply to thread", raw_size: 180, attachments: [] },
          { uid: 3, folder: "INBOX", message_id: "<reply2@example.com>", in_reply_to: "<root@example.com>", references: "<root@example.com> <reply1@example.com>", from_address: "alice@example.com", from_name: "Alice", to_addresses: "bob@example.com", subject: "Re: Original thread", date: baseDate, is_read: false, is_starred: false, is_draft: false, body_html: null, body_text: "Another reply", snippet: "Another reply", raw_size: 150, attachments: [] },
        ],
        folder_status: { uidvalidity: 1, uidnext: 100, exists: 3, unseen: 3 },
      });

      const { imapInitialSync } = await import("@/services/imap/imapSync");
      await imapInitialSync(getTestAccountId());

      const threads = await getTestThreads();
      expect(threads.length).toBeGreaterThanOrEqual(1);

      const messages = await getTestMessages();
      expect(messages).toHaveLength(3);

      const threadIds = new Set(messages.map((m: any) => m.thread_id));
      expect(threadIds.size).toBe(1);

      const orderedMessages = messages.sort((a: any, b: any) => a.date - b.date);
      expect(orderedMessages[0]!.subject).toBe("Original thread");
      expect(orderedMessages[1]!.subject).toBe("Re: Original thread");
      expect(orderedMessages[2]!.subject).toBe("Re: Original thread");
    });
  });
});
