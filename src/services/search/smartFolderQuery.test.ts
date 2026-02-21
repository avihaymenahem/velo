import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveQueryTokens,
  getSmartFolderSearchQuery,
  getSmartFolderUnreadCount,
  mapSmartFolderRows,
  type SmartFolderRow,
} from "./smartFolderQuery";
import { getThreadLabelIds, getThreadById } from "@/services/db/threads";

vi.mock("@/services/db/threads", () => ({
  getThreadLabelIds: vi.fn(),
  getThreadById: vi.fn(),
}));

const mockGetThreadLabelIds = vi.mocked(getThreadLabelIds);
const mockGetThreadById = vi.mocked(getThreadById);

describe("resolveQueryTokens", () => {
  beforeEach(() => {
    // Fix the date to 2025-03-15 00:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 2, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("replaces __LAST_7_DAYS__ with date 7 days ago", () => {
    const result = resolveQueryTokens(
      "is:starred after:__LAST_7_DAYS__",
    );
    expect(result).toBe("is:starred after:2025/03/08");
  });

  it("replaces __LAST_30_DAYS__ with date 30 days ago", () => {
    const result = resolveQueryTokens(
      "from:boss after:__LAST_30_DAYS__",
    );
    expect(result).toBe("from:boss after:2025/02/13");
  });

  it("replaces __TODAY__ with today's date", () => {
    const result = resolveQueryTokens("before:__TODAY__");
    expect(result).toBe("before:2025/03/15");
  });

  it("replaces multiple tokens in one query", () => {
    const result = resolveQueryTokens(
      "after:__LAST_7_DAYS__ before:__TODAY__",
    );
    expect(result).toBe("after:2025/03/08 before:2025/03/15");
  });

  it("returns query unchanged when no tokens present", () => {
    const result = resolveQueryTokens("is:unread from:john");
    expect(result).toBe("is:unread from:john");
  });
});

describe("getSmartFolderSearchQuery", () => {
  it("returns sql and params", () => {
    const result = getSmartFolderSearchQuery("is:unread", "acc-1");
    expect(result).toHaveProperty("sql");
    expect(result).toHaveProperty("params");
    expect(typeof result.sql).toBe("string");
    expect(Array.isArray(result.params)).toBe(true);
  });

  it("includes account filter", () => {
    const { sql, params } = getSmartFolderSearchQuery("is:unread", "acc-1");
    expect(sql).toContain("m.account_id =");
    expect(params).toContain("acc-1");
  });

  it("includes is:unread filter", () => {
    const { sql } = getSmartFolderSearchQuery("is:unread", "acc-1");
    expect(sql).toContain("m.is_read = 0");
  });

  it("includes has:attachment filter", () => {
    const { sql } = getSmartFolderSearchQuery("has:attachment", "acc-1");
    expect(sql).toContain("EXISTS (SELECT 1 FROM attachments");
  });

  it("respects custom limit", () => {
    const { params } = getSmartFolderSearchQuery("is:unread", "acc-1", 25);
    expect(params[params.length - 1]).toBe(25);
  });

  it("defaults to limit 50", () => {
    const { params } = getSmartFolderSearchQuery("is:unread", "acc-1");
    expect(params[params.length - 1]).toBe(50);
  });
});

describe("getSmartFolderUnreadCount", () => {
  it("returns sql and params for count query", () => {
    const result = getSmartFolderUnreadCount("has:attachment", "acc-1");
    expect(result).toHaveProperty("sql");
    expect(result).toHaveProperty("params");
  });

  it("generates a COUNT query", () => {
    const { sql } = getSmartFolderUnreadCount("has:attachment", "acc-1");
    expect(sql).toContain("COUNT(DISTINCT m.id)");
  });

  it("includes unread filter", () => {
    const { sql } = getSmartFolderUnreadCount("has:attachment", "acc-1");
    expect(sql).toContain("m.is_read = 0");
  });

  it("does not include LIMIT", () => {
    const { sql } = getSmartFolderUnreadCount("is:starred", "acc-1");
    expect(sql).not.toMatch(/LIMIT/i);
  });

  it("does not corrupt FROM keyword by matching column names like from_name", () => {
    const { sql } = getSmartFolderUnreadCount("is:unread", "acc-1");
    // The regex should replace up to the SQL FROM keyword, not stop at "from" in "from_name"
    expect(sql).toMatch(/^SELECT COUNT\(DISTINCT m\.id\) as count\s+FROM\b/i);
    expect(sql).not.toContain("from_name");
    expect(sql).not.toContain("from_address");
  });
});

describe("mapSmartFolderRows", () => {
  const makeRow = (overrides: Partial<SmartFolderRow> = {}): SmartFolderRow => ({
    message_id: "msg-1",
    account_id: "acc-1",
    thread_id: "thread-1",
    subject: "Test subject",
    from_name: "Alice",
    from_address: "alice@example.com",
    snippet: "Hello...",
    date: 1700000000,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetThreadLabelIds.mockResolvedValue(["INBOX"]);
    mockGetThreadById.mockResolvedValue(undefined);
  });

  it("maps thread properties from DB thread data (read thread)", async () => {
    mockGetThreadById.mockResolvedValue({
      id: "thread-1",
      account_id: "acc-1",
      subject: "Test subject",
      snippet: "Hello...",
      last_message_at: 1700000000,
      message_count: 3,
      is_read: 1,
      is_starred: 1,
      is_important: 0,
      has_attachments: 1,
      is_snoozed: 0,
      snooze_until: null,
      is_pinned: 1,
      is_muted: 0,
      from_name: "Alice",
      from_address: "alice@example.com",
    });

    const result = await mapSmartFolderRows([makeRow()]);

    expect(result).toHaveLength(1);
    expect(result[0]!.isRead).toBe(true);
    expect(result[0]!.isStarred).toBe(true);
    expect(result[0]!.isPinned).toBe(true);
    expect(result[0]!.isMuted).toBe(false);
    expect(result[0]!.hasAttachments).toBe(true);
    expect(result[0]!.messageCount).toBe(3);
  });

  it("maps unread thread correctly", async () => {
    mockGetThreadById.mockResolvedValue({
      id: "thread-1",
      account_id: "acc-1",
      subject: "Test subject",
      snippet: "Hello...",
      last_message_at: 1700000000,
      message_count: 1,
      is_read: 0,
      is_starred: 0,
      is_important: 0,
      has_attachments: 0,
      is_snoozed: 0,
      snooze_until: null,
      is_pinned: 0,
      is_muted: 1,
      from_name: "Bob",
      from_address: "bob@example.com",
    });

    const result = await mapSmartFolderRows([makeRow()]);

    expect(result[0]!.isRead).toBe(false);
    expect(result[0]!.isStarred).toBe(false);
    expect(result[0]!.isPinned).toBe(false);
    expect(result[0]!.isMuted).toBe(true);
    expect(result[0]!.hasAttachments).toBe(false);
  });

  it("defaults to safe values when thread not found in DB", async () => {
    mockGetThreadById.mockResolvedValue(undefined);

    const result = await mapSmartFolderRows([makeRow()]);

    expect(result[0]!.isRead).toBe(false);
    expect(result[0]!.isStarred).toBe(false);
    expect(result[0]!.isPinned).toBe(false);
    expect(result[0]!.isMuted).toBe(false);
    expect(result[0]!.hasAttachments).toBe(false);
    expect(result[0]!.messageCount).toBe(1);
  });

  it("deduplicates rows by thread_id", async () => {
    const rows = [
      makeRow({ message_id: "msg-1", thread_id: "thread-1" }),
      makeRow({ message_id: "msg-2", thread_id: "thread-1" }),
      makeRow({ message_id: "msg-3", thread_id: "thread-2" }),
    ];

    const result = await mapSmartFolderRows(rows);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("thread-1");
    expect(result[1]!.id).toBe("thread-2");
  });

  it("includes label IDs from getThreadLabelIds", async () => {
    mockGetThreadLabelIds.mockResolvedValue(["INBOX", "Label_1"]);

    const result = await mapSmartFolderRows([makeRow()]);

    expect(result[0]!.labelIds).toEqual(["INBOX", "Label_1"]);
  });

  it("preserves search result metadata (subject, snippet, date, from)", async () => {
    const row = makeRow({
      subject: "Important meeting",
      snippet: "Please join...",
      date: 1700000000,
      from_name: "Carol",
      from_address: "carol@example.com",
    });

    const result = await mapSmartFolderRows([row]);

    expect(result[0]!.subject).toBe("Important meeting");
    expect(result[0]!.snippet).toBe("Please join...");
    expect(result[0]!.lastMessageAt).toBe(1700000000);
    expect(result[0]!.fromName).toBe("Carol");
    expect(result[0]!.fromAddress).toBe("carol@example.com");
  });
});
