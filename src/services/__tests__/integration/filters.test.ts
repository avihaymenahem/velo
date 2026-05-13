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
    })),
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

describe("Integration: Filters", () => {
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

  describe("Test #6: Apply filter rule during sync", () => {
    it("matches a message against filter criteria and applies label action", async () => {
      const { insertFilter, getFilterRuleById } = await import("@/services/db/filters");
      const filterRuleId = await insertFilter({
        accountId: getTestAccountId(),
        name: "Filter newsletters",
        criteria: { subject: "Newsletter" },
        actions: { applyLabel: "IMPORTANT", markRead: true },
      });

      const filterRule = await getFilterRuleById(filterRuleId);
      expect(filterRule).not.toBeNull();

      const matchMessage = {
        id: "msg-match",
        threadId: "thread-match",
        accountId: getTestAccountId(),
        fromAddress: "newsletter@example.com",
        fromName: "Newsletter",
        toAddresses: "user@example.com",
        subject: "Weekly Newsletter",
        snippet: "This week's news...",
        date: Date.now(),
        isRead: false,
        isStarred: false,
        bodyHtml: "<p>News content</p>",
        bodyText: "News content",
        rawSize: 500,
        internalDate: Date.now(),
        labelIds: ["INBOX"],
        hasAttachments: false,
        attachments: [],
        replyTo: null,
        ccAddresses: null,
        bccAddresses: null,
        listUnsubscribe: null,
        listUnsubscribePost: null,
        authResults: null,
      };

      const noMatchMessage = {
        ...matchMessage,
        id: "msg-nomatch",
        threadId: "thread-nomatch",
        subject: "Work meeting",
      };

      const criteria = JSON.parse(filterRule!.criteria_json);
      const { messageMatchesFilter } = await import("@/services/filters/filterEngine");
      expect(messageMatchesFilter(matchMessage, criteria)).toBe(true);
      expect(messageMatchesFilter(noMatchMessage, criteria)).toBe(false);

      const { computeFilterActions } = await import("@/services/filters/filterEngine");
      const actions = JSON.parse(filterRule!.actions_json);
      const result = computeFilterActions(actions);
      expect(result.markRead).toBe(true);
      expect(result.addLabelIds).toContain("IMPORTANT");

      const { upsertThread } = await import("@/services/db/threads");
      await upsertThread({
        id: "thread-match",
        accountId: getTestAccountId(),
        subject: "Weekly Newsletter",
        snippet: "This week's news...",
        lastMessageAt: Date.now(),
        messageCount: 1,
        isRead: false,
        isStarred: false,
        isImportant: false,
        hasAttachments: false,
      });

      const { applyFiltersToMessages } = await import("@/services/filters/filterEngine");
      await applyFiltersToMessages(getTestAccountId(), [matchMessage]);

      const threadLabels = await db!.select<{ label_id: string }[]>(
        "SELECT label_id FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
        [getTestAccountId(), "thread-match"],
      );
      const labelIds = threadLabels.map((r) => r.label_id);
      expect(labelIds).toContain("IMPORTANT");
    });

    it("applies archive action when filter matches", async () => {
      const { insertFilter } = await import("@/services/db/filters");
      await insertFilter({
        accountId: getTestAccountId(),
        name: "Archive newsletters",
        criteria: { from: "newsletter" },
        actions: { archive: true },
      });

      const { upsertThread } = await import("@/services/db/threads");
      await upsertThread({
        id: "thread-archive",
        accountId: getTestAccountId(),
        subject: "Monthly Newsletter",
        snippet: "Archive me",
        lastMessageAt: Date.now(),
        messageCount: 1,
        isRead: false,
        isStarred: false,
        isImportant: false,
        hasAttachments: false,
      });

      const { applyFiltersToMessages } = await import("@/services/filters/filterEngine");
      await applyFiltersToMessages(getTestAccountId(), [{
        id: "msg-archive",
        threadId: "thread-archive",
        accountId: getTestAccountId(),
        fromAddress: "newsletter@example.com",
        fromName: "Newsletter",
        toAddresses: "user@example.com",
        subject: "Monthly Newsletter",
        snippet: "Archive me",
        date: Date.now(),
        isRead: false,
        isStarred: false,
        bodyHtml: null,
        bodyText: "Archive me",
        rawSize: 100,
        internalDate: Date.now(),
        labelIds: ["INBOX"],
        hasAttachments: false,
        attachments: [],
        replyTo: null,
        ccAddresses: null,
        bccAddresses: null,
        listUnsubscribe: null,
        listUnsubscribePost: null,
        authResults: null,
      }]);

      const threadLabels = await db!.select<{ label_id: string }[]>(
        "SELECT label_id FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
        [getTestAccountId(), "thread-archive"],
      );
      const labelIds = threadLabels.map((r) => r.label_id);
      expect(labelIds).not.toContain("INBOX");
    });
  });
});
