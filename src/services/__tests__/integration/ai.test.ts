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

const mockAiComplete = vi.fn();

vi.mock("@/services/ai/providerManager", () => ({
  getActiveProvider: vi.fn(() => Promise.resolve({
    complete: mockAiComplete,
    testConnection: vi.fn(() => Promise.resolve(true)),
  })),
}));

vi.mock("@/services/ai/prompts", () => ({
  SUMMARIZE_PROMPT: "Summarize this email thread concisely.",
  COMPOSE_PROMPT: "",
  REPLY_PROMPT: "",
  IMPROVE_PROMPT: "",
  SHORTEN_PROMPT: "",
  FORMALIZE_PROMPT: "",
  CATEGORIZE_PROMPT: "",
  SMART_REPLY_PROMPT: "",
  ASK_INBOX_PROMPT: "",
  SMART_LABEL_PROMPT: "",
  EXTRACT_TASK_PROMPT: "",
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: AI Thread Summary", () => {
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

  describe("Test #8: AI thread summary", () => {
    it("calls AI provider and caches result in ai_cache", async () => {
      mockAiComplete.mockResolvedValue("Alice is asking about the project timeline. Bob suggests a meeting next week.");

      const { upsertThread } = await import("@/services/db/threads");
      await upsertThread({
        id: "thread-ai-1",
        accountId: getTestAccountId(),
        subject: "Project Timeline",
        snippet: "When is the deadline?",
        lastMessageAt: Date.now(),
        messageCount: 2,
        isRead: false,
        isStarred: false,
        isImportant: false,
        hasAttachments: false,
      });

      const { upsertMessage } = await import("@/services/db/messages");
      await upsertMessage({
        id: "msg-ai-1",
        accountId: getTestAccountId(),
        threadId: "thread-ai-1",
        fromAddress: "alice@example.com",
        fromName: "Alice",
        toAddresses: "bob@example.com",
        ccAddresses: null,
        bccAddresses: null,
        replyTo: null,
        subject: "Project Timeline",
        snippet: "When is the deadline?",
        date: Date.now() - 60000,
        isRead: false,
        isStarred: false,
        bodyHtml: null,
        bodyText: "Hey Bob, when is the deadline for the project?",
        rawSize: 100,
        internalDate: Date.now() - 60000,
      });
      await upsertMessage({
        id: "msg-ai-2",
        accountId: getTestAccountId(),
        threadId: "thread-ai-1",
        fromAddress: "bob@example.com",
        fromName: "Bob",
        toAddresses: "alice@example.com",
        ccAddresses: null,
        bccAddresses: null,
        replyTo: null,
        subject: "Re: Project Timeline",
        snippet: "Let's meet next week",
        date: Date.now(),
        isRead: false,
        isStarred: false,
        bodyHtml: null,
        bodyText: "Hi Alice, let's schedule a meeting for next week to discuss.",
        rawSize: 100,
        internalDate: Date.now(),
      });

      const { getMessagesForThread } = await import("@/services/db/messages");
      const messages = await getMessagesForThread(getTestAccountId(), "thread-ai-1");
      expect(messages).toHaveLength(2);

      const { summarizeThread } = await import("@/services/ai/aiService");
      const summary = await summarizeThread("thread-ai-1", getTestAccountId(), messages);

      expect(mockAiComplete).toHaveBeenCalledTimes(1);
      expect(summary).toBeTruthy();

      const cached = await db!.select<{ content: string; type: string }[]>(
        "SELECT content, type FROM ai_cache WHERE account_id = $1 AND thread_id = $2",
        [getTestAccountId(), "thread-ai-1"],
      );
      expect(cached).toHaveLength(1);
      expect(cached[0]!.type).toBe("summary");
      expect(cached[0]!.content).toBe("Alice is asking about the project timeline. Bob suggests a meeting next week.");
    });

    it("returns cached result on second call without hitting AI provider again", async () => {
      mockAiComplete.mockResolvedValue("First summary");

      const { getMessagesForThread } = await import("@/services/db/messages");
      const { upsertMessage } = await import("@/services/db/messages");
      const { upsertThread } = await import("@/services/db/threads");

      await upsertThread({
        id: "thread-ai-2",
        accountId: getTestAccountId(),
        subject: "Cache Test",
        snippet: "Testing",
        lastMessageAt: Date.now(),
        messageCount: 1,
        isRead: false,
        isStarred: false,
        isImportant: false,
        hasAttachments: false,
      });
      await upsertMessage({
        id: "msg-ai-cache",
        accountId: getTestAccountId(),
        threadId: "thread-ai-2",
        fromAddress: "test@example.com",
        fromName: "Test",
        toAddresses: "me@example.com",
        ccAddresses: null,
        bccAddresses: null,
        replyTo: null,
        subject: "Cache Test",
        snippet: "Testing",
        date: Date.now(),
        isRead: false,
        isStarred: false,
        bodyHtml: null,
        bodyText: "Testing cache behavior",
        rawSize: 50,
        internalDate: Date.now(),
      });

      const messages = await getMessagesForThread(getTestAccountId(), "thread-ai-2");
      const { summarizeThread } = await import("@/services/ai/aiService");

      await summarizeThread("thread-ai-2", getTestAccountId(), messages);
      expect(mockAiComplete).toHaveBeenCalledTimes(1);

      mockAiComplete.mockClear();

      const result2 = await summarizeThread("thread-ai-2", getTestAccountId(), messages);
      expect(result2).toBe("First summary");
      expect(mockAiComplete).not.toHaveBeenCalled();
    });
  });
});
