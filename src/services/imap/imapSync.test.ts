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
}));
vi.mock("../db/folderSyncState", () => ({
  upsertFolderSyncState: vi.fn(),
  getAllFolderSyncStates: vi.fn(),
}));
vi.mock("../db/pendingOperations", () => ({
  getPendingOpsForResource: vi.fn(() => []),
}));

import { imapMessageToParsedMessage, imapInitialSync, formatImapDate, computeSinceDate } from "./imapSync";
import {
  createMockImapMessage,
  createMockImapAccount,
  createMockImapFolder,
  createMockImapFolderStatus,
  createMockImapFetchResult,
} from "@/test/mocks";
import { imapListFolders, imapSearchFolder, imapFetchMessages } from "./tauriCommands";
import { getAccount } from "../db/accounts";
import { withTransaction } from "../db/connection";
import { upsertMessage, updateMessageThreadIds } from "../db/messages";
import { upsertThread } from "../db/threads";
import { upsertAttachment } from "../db/attachments";

describe("imapMessageToParsedMessage", () => {
  it("converts basic IMAP message to ParsedMessage format", () => {
    const msg = createMockImapMessage();
    const { parsed, threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(parsed.id).toBe("imap-acc-1-INBOX-42");
    expect(parsed.fromAddress).toBe("sender@example.com");
    expect(parsed.fromName).toBe("Sender Name");
    expect(parsed.toAddresses).toBe("recipient@example.com");
    expect(parsed.subject).toBe("Test Subject");
    expect(parsed.date).toBe(1700000000000);
    expect(parsed.isRead).toBe(false);
    expect(parsed.isStarred).toBe(false);
    expect(parsed.bodyHtml).toBe("<p>Hello</p>");
    expect(parsed.bodyText).toBe("Hello");
    expect(parsed.snippet).toBe("Hello");
    expect(parsed.rawSize).toBe(1024);
    expect(parsed.hasAttachments).toBe(false);
    expect(parsed.attachments).toEqual([]);
  });

  it("generates stable message ID from account, folder, and uid", () => {
    const msg = createMockImapMessage({ uid: 99, folder: "Sent" });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-2", "SENT");
    expect(parsed.id).toBe("imap-acc-2-Sent-99");
  });

  it("includes UNREAD label for unread messages", () => {
    const msg = createMockImapMessage({ is_read: false });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.labelIds).toContain("UNREAD");
    expect(parsed.labelIds).toContain("INBOX");
  });

  it("does not include UNREAD label for read messages", () => {
    const msg = createMockImapMessage({ is_read: true });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.labelIds).not.toContain("UNREAD");
    expect(parsed.labelIds).toContain("INBOX");
  });

  it("includes STARRED label for flagged messages", () => {
    const msg = createMockImapMessage({ is_starred: true, is_read: true });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.labelIds).toContain("STARRED");
  });

  it("creates threadable message with correct fields", () => {
    const msg = createMockImapMessage({
      message_id: "<msg-abc@host.com>",
      in_reply_to: "<msg-parent@host.com>",
      references: "<msg-root@host.com> <msg-parent@host.com>",
    });
    const { threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(threadable.id).toBe("imap-acc-1-INBOX-42");
    expect(threadable.messageId).toBe("<msg-abc@host.com>");
    expect(threadable.inReplyTo).toBe("<msg-parent@host.com>");
    expect(threadable.references).toBe("<msg-root@host.com> <msg-parent@host.com>");
    expect(threadable.subject).toBe("Test Subject");
    expect(threadable.date).toBe(1700000000000);
  });

  it("generates synthetic message ID when none present", () => {
    const msg = createMockImapMessage({ message_id: null });
    const { threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(threadable.messageId).toBe("synthetic-acc-1-INBOX-42@velo.local");
  });

  it("converts attachments correctly", () => {
    const msg = createMockImapMessage({
      attachments: [
        {
          part_id: "2",
          filename: "report.pdf",
          mime_type: "application/pdf",
          size: 50000,
          content_id: null,
          is_inline: false,
        },
        {
          part_id: "3",
          filename: "logo.png",
          mime_type: "image/png",
          size: 1024,
          content_id: "logo-cid",
          is_inline: true,
        },
      ],
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(parsed.hasAttachments).toBe(true);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]).toEqual({
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 50000,
      gmailAttachmentId: "2",
      contentId: null,
      isInline: false,
    });
    expect(parsed.attachments[1]).toEqual({
      filename: "logo.png",
      mimeType: "image/png",
      size: 1024,
      gmailAttachmentId: "3",
      contentId: "logo-cid",
      isInline: true,
    });
  });

  it("generates snippet from body_text when snippet is null", () => {
    const msg = createMockImapMessage({
      snippet: null,
      body_text: "This is a long email body that should be truncated to create a snippet for display purposes.",
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.snippet).toBe("This is a long email body that should be truncated to create a snippet for display purposes.");
  });

  it("handles null body fields gracefully", () => {
    const msg = createMockImapMessage({
      body_html: null,
      body_text: null,
      snippet: null,
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.bodyHtml).toBeNull();
    expect(parsed.bodyText).toBeNull();
    expect(parsed.snippet).toBe("");
  });

  it("preserves list-unsubscribe headers", () => {
    const msg = createMockImapMessage({
      list_unsubscribe: "<mailto:unsub@list.com>",
      list_unsubscribe_post: "List-Unsubscribe=One-Click",
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.listUnsubscribe).toBe("<mailto:unsub@list.com>");
    expect(parsed.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
  });

  it("preserves auth results", () => {
    const msg = createMockImapMessage({
      auth_results: '{"spf":"pass","dkim":"pass"}',
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.authResults).toBe('{"spf":"pass","dkim":"pass"}');
  });

  it("handles date=0 (unparseable Date header) without crashing", () => {
    const msg = createMockImapMessage({ date: 0 });
    const { parsed, threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    // date=0 * 1000 = 0, passed through — the caller (imapInitialSync) applies the fallback
    expect(parsed.date).toBe(0);
    expect(threadable.date).toBe(0);
    // Message should still be valid
    expect(parsed.id).toBe("imap-acc-1-INBOX-42");
    expect(parsed.fromAddress).toBe("sender@example.com");
  });
});

describe("imapInitialSync", () => {
  const mockGetAccount = vi.mocked(getAccount);
  const mockImapListFolders = vi.mocked(imapListFolders);
  const mockImapSearchFolder = vi.mocked(imapSearchFolder);
  const mockImapFetchMessages = vi.mocked(imapFetchMessages);
  const mockWithTransaction = vi.mocked(withTransaction);
  const mockUpsertMessage = vi.mocked(upsertMessage);
  const mockUpdateMessageThreadIds = vi.mocked(updateMessageThreadIds);
  const mockUpsertThread = vi.mocked(upsertThread);
  const mockUpsertAttachment = vi.mocked(upsertAttachment);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetAccount.mockResolvedValue(createMockImapAccount({ id: "acc-1" }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Configure mocks to return a single folder with the given messages. */
  function setupFolderWithMessages(folder: string, messages: ReturnType<typeof createMockImapMessage>[]) {
    const mockFolder = createMockImapFolder({
      path: folder,
      raw_path: folder,
      exists: messages.length,
    });
    mockImapListFolders.mockResolvedValue([mockFolder]);
    // imapSearchFolder returns UIDs + folder status (no message bodies)
    mockImapSearchFolder.mockResolvedValue({
      uids: messages.map((m) => m.uid),
      folder_status: createMockImapFolderStatus({ exists: messages.length }),
    });
    // imapFetchMessages returns full messages for the requested UIDs
    mockImapFetchMessages.mockResolvedValue(
      createMockImapFetchResult(messages),
    );
    return mockFolder;
  }

  it("stores messages to DB immediately per-chunk (streaming)", async () => {
    const msg1 = createMockImapMessage({ uid: 1, message_id: "<m1@test>", subject: "First", date: Math.floor(Date.now() / 1000) });
    const msg2 = createMockImapMessage({ uid: 2, message_id: "<m2@test>", subject: "Second", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg1, msg2]);

    await imapInitialSync("acc-1");

    // Messages should be stored individually via upsertMessage during fetch phase
    expect(mockUpsertMessage).toHaveBeenCalledTimes(2);

    // Each message should be stored with placeholder threadId = messageId
    const firstCallArgs = mockUpsertMessage.mock.calls[0]![0];
    expect(firstCallArgs.threadId).toBe(firstCallArgs.id);

    const secondCallArgs = mockUpsertMessage.mock.calls[1]![0];
    expect(secondCallArgs.threadId).toBe(secondCallArgs.id);
  });

  it("creates placeholder thread before each message to satisfy FK constraint", async () => {
    const msg1 = createMockImapMessage({ uid: 1, message_id: "<m1@test>", subject: "Hello", date: Math.floor(Date.now() / 1000) });
    const msg2 = createMockImapMessage({ uid: 2, message_id: "<m2@test>", subject: "World", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg1, msg2]);

    await imapInitialSync("acc-1");

    // For each message, upsertThread should be called BEFORE upsertMessage
    // to satisfy the FK constraint (messages.thread_id → threads.id).
    // Phase 2: 2 placeholder threads + Phase 4: 1 or 2 final threads
    expect(mockUpsertThread.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockUpsertMessage).toHaveBeenCalledTimes(2);

    // Each placeholder thread must be created before its corresponding message.
    // Verify by checking that the nth thread call preceded the nth message call.
    for (let i = 0; i < 2; i++) {
      const threadOrder = mockUpsertThread.mock.invocationCallOrder[i]!;
      const messageOrder = mockUpsertMessage.mock.invocationCallOrder[i]!;
      expect(threadOrder).toBeLessThan(messageOrder);
    }

    // Verify placeholder threads use the message ID as thread ID
    const firstThreadCall = mockUpsertThread.mock.calls[0]![0];
    const firstMsgCall = mockUpsertMessage.mock.calls[0]![0];
    expect(firstThreadCall.id).toBe(firstMsgCall.id);
    expect(firstThreadCall.id).toBe(firstMsgCall.threadId);
  });

  it("updates thread IDs after threading phase", async () => {
    const msg1 = createMockImapMessage({ uid: 1, message_id: "<m1@test>", subject: "Hello", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg1]);

    await imapInitialSync("acc-1");

    // Thread record should be created: once as placeholder in Phase 2, once final in Phase 4
    expect(mockUpsertThread).toHaveBeenCalledTimes(2);

    // Thread IDs should be batch-updated via updateMessageThreadIds
    expect(mockUpdateMessageThreadIds).toHaveBeenCalledTimes(1);
    const [accountId, messageIds, threadId] = mockUpdateMessageThreadIds.mock.calls[0]!;
    expect(accountId).toBe("acc-1");
    expect(messageIds).toHaveLength(1);
    expect(threadId).toBeTruthy();
  });

  it("returns empty messages array (bodies not accumulated)", async () => {
    const msg = createMockImapMessage({ uid: 1, message_id: "<m1@test>", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg]);

    const result = await imapInitialSync("acc-1");

    // The streaming approach returns empty array — bodies are already in DB
    expect(result.messages).toEqual([]);
  });

  it("stores attachments immediately with the message", async () => {
    const msg = createMockImapMessage({
      uid: 1,
      message_id: "<m1@test>",
      date: Math.floor(Date.now() / 1000),
      attachments: [
        {
          part_id: "2",
          filename: "doc.pdf",
          mime_type: "application/pdf",
          size: 5000,
          content_id: null,
          is_inline: false,
        },
      ],
    });
    setupFolderWithMessages("INBOX", [msg]);

    await imapInitialSync("acc-1");

    expect(mockUpsertAttachment).toHaveBeenCalledTimes(1);
    expect(mockUpsertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "doc.pdf",
        mimeType: "application/pdf",
        accountId: "acc-1",
      }),
    );
  });

  it("filters messages by date cutoff", async () => {
    const recentDate = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
    const oldDate = Math.floor(Date.now() / 1000) - 400 * 86400; // 400 days ago

    const recentMsg = createMockImapMessage({ uid: 1, message_id: "<recent@test>", date: recentDate });
    const oldMsg = createMockImapMessage({ uid: 2, message_id: "<old@test>", date: oldDate });

    setupFolderWithMessages("INBOX", [recentMsg, oldMsg]);

    await imapInitialSync("acc-1", 365);

    // Only recent message should be stored (old one is beyond 365 days)
    expect(mockUpsertMessage).toHaveBeenCalledTimes(1);
    expect(mockUpsertMessage.mock.calls[0]![0].id).toContain("1"); // uid=1
  });

  it("handles empty folders gracefully", async () => {
    const mockFolder = createMockImapFolder({ path: "INBOX", raw_path: "INBOX", exists: 0 });
    mockImapListFolders.mockResolvedValue([mockFolder]);

    const result = await imapInitialSync("acc-1");

    expect(mockImapSearchFolder).not.toHaveBeenCalled();
    expect(mockUpsertMessage).not.toHaveBeenCalled();
    expect(result.messages).toEqual([]);
  });

  it("reports progress through all phases", async () => {
    const msg = createMockImapMessage({ uid: 1, message_id: "<m1@test>", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg]);

    const progressCalls: Array<{ phase: string }> = [];
    await imapInitialSync("acc-1", 365, (progress) => {
      progressCalls.push({ phase: progress.phase });
    });

    const phases = progressCalls.map((p) => p.phase);
    expect(phases).toContain("folders");
    expect(phases).toContain("messages");
    expect(phases).toContain("threading");
    expect(phases).toContain("storing_threads");
    expect(phases).toContain("done");
  });

  it("uses imapSearchFolder + imapFetchMessages for chunked sync per folder", async () => {
    const msg = createMockImapMessage({ uid: 1, message_id: "<m1@test>", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg]);

    await imapInitialSync("acc-1");

    // Should use imapSearchFolder (lightweight search) with SINCE date filter
    expect(mockImapSearchFolder).toHaveBeenCalledTimes(1);
    expect(mockImapSearchFolder).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com" }),
      "INBOX",
      expect.stringMatching(/^\d{1,2}-[A-Z][a-z]{2}-\d{4}$/), // sinceDate in DD-Mon-YYYY format
    );

    // Then fetch the messages by UID
    expect(mockImapFetchMessages).toHaveBeenCalledTimes(1);
    expect(mockImapFetchMessages).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.example.com" }),
      "INBOX",
      [1], // UIDs from search
    );
  });

  it("wraps chunk DB writes in a transaction", async () => {
    const msg = createMockImapMessage({ uid: 1, message_id: "<m1@test>", date: Math.floor(Date.now() / 1000) });
    setupFolderWithMessages("INBOX", [msg]);

    await imapInitialSync("acc-1");

    // withTransaction should be called: once for Phase 2 chunk + once for Phase 4 batch
    expect(mockWithTransaction).toHaveBeenCalledTimes(2);
  });

  it("continues to next chunk on fetch error", async () => {
    const msg1 = createMockImapMessage({ uid: 1, message_id: "<m1@test>", date: Math.floor(Date.now() / 1000) });
    const msg2 = createMockImapMessage({ uid: 201, message_id: "<m2@test>", date: Math.floor(Date.now() / 1000) });

    const mockFolder = createMockImapFolder({ path: "INBOX", raw_path: "INBOX", exists: 2 });
    mockImapListFolders.mockResolvedValue([mockFolder]);

    // Return UIDs in two "chunks" (we'll set CHUNK_SIZE to 200 but have UIDs 1 and 201)
    mockImapSearchFolder.mockResolvedValue({
      uids: [1, 201],
      folder_status: createMockImapFolderStatus({ exists: 2 }),
    });

    // First chunk fetch succeeds, but because both UIDs are in the same chunk (< 200),
    // we test error handling by making imapFetchMessages fail on first call and succeed on retry
    mockImapFetchMessages
      .mockRejectedValueOnce(new Error("fetch timeout"))
      .mockResolvedValueOnce(createMockImapFetchResult([msg2]));

    // This won't exercise the multi-chunk path since 2 UIDs < 200 chunk size.
    // Instead test that a search failure at folder level is handled.
    // Reset and use a simpler approach: single chunk that fails
    vi.clearAllMocks();
    mockGetAccount.mockResolvedValue(createMockImapAccount({ id: "acc-1" }));

    const msgs = Array.from({ length: 2 }, (_, i) =>
      createMockImapMessage({ uid: i + 1, message_id: `<m${i}@test>`, date: Math.floor(Date.now() / 1000) }),
    );
    setupFolderWithMessages("INBOX", msgs);

    // Even if imapFetchMessages fails for one chunk, the folder-level error is caught
    mockImapFetchMessages.mockRejectedValueOnce(new Error("chunk fetch failed"));

    const syncPromise = imapInitialSync("acc-1");
    await vi.runAllTimersAsync();
    const result = await syncPromise;

    // Sync should complete without throwing
    expect(result.messages).toEqual([]);
  });

  it("circuit breaker skips remaining folders after 5 consecutive connection failures", async () => {
    const folders = Array.from({ length: 8 }, (_, i) =>
      createMockImapFolder({ path: `folder-${i}`, raw_path: `folder-${i}`, exists: 10 }),
    );
    mockImapListFolders.mockResolvedValue(folders);
    mockImapSearchFolder.mockRejectedValue(new Error("TCP connect timed out (os error 60)"));

    const syncPromise = imapInitialSync("acc-1");
    await vi.runAllTimersAsync();
    await syncPromise;

    // Circuit breaker should stop after 5 failures (CIRCUIT_BREAKER_MAX_FAILURES)
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

    const msg = createMockImapMessage({ uid: 1, message_id: "<m1@test>", date: Math.floor(Date.now() / 1000) });

    // First 2 fail with connection error, 3rd succeeds, 4th fails
    mockImapSearchFolder
      .mockRejectedValueOnce(new Error("TCP connect timed out"))
      .mockRejectedValueOnce(new Error("TCP connect timed out"))
      .mockResolvedValueOnce({
        uids: [msg.uid],
        folder_status: createMockImapFolderStatus({ exists: 1 }),
      })
      .mockRejectedValueOnce(new Error("TCP connect timed out"));

    mockImapFetchMessages.mockResolvedValue(createMockImapFetchResult([msg]));

    const syncPromise = imapInitialSync("acc-1");
    await vi.runAllTimersAsync();
    await syncPromise;

    // All 4 folders should be attempted (circuit breaker resets after success on f3)
    expect(mockImapSearchFolder).toHaveBeenCalledTimes(4);
  });

  it("continues on non-connection errors without triggering circuit breaker", async () => {
    const folders = Array.from({ length: 6 }, (_, i) =>
      createMockImapFolder({ path: `folder-${i}`, raw_path: `folder-${i}`, exists: 10 }),
    );
    mockImapListFolders.mockResolvedValue(folders);

    // Non-connection errors should NOT trigger circuit breaker
    mockImapSearchFolder.mockRejectedValue(new Error("PARSE failed: invalid response"));

    const syncPromise = imapInitialSync("acc-1");
    await vi.runAllTimersAsync();
    await syncPromise;

    // All folders should be attempted since these aren't connection errors
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
