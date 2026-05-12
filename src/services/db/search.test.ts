import { describe, it, expect, vi, beforeEach } from "vitest";
import { unifiedSearch } from "./search";
import type { UnifiedSearchResult } from "./search";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
  queryWithRetry: vi.fn(async (fn) => fn({ select: mockSelect, execute: vi.fn() })),
}));

describe("unifiedSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty query", async () => {
    const result = await unifiedSearch("", "acc-1");
    expect(result).toEqual([]);
  });

  it("returns empty array for whitespace-only query", async () => {
    const result = await unifiedSearch("   ", "acc-1");
    expect(result).toEqual([]);
  });

  it("returns results sorted by rank (messages first), then date descending", async () => {
    mockSelect
      .mockResolvedValueOnce([
        { type: "message", id: "m1", title: "Subject A", snippet: "snippet", date: 1000, rank: 1, account_id: "acc-1", metadata: "{}" },
        { type: "message", id: "m2", title: "Subject B", snippet: "snippet", date: 2000, rank: 2, account_id: "acc-1", metadata: "{}" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const results = await unifiedSearch("test", "acc-1");
    expect(results).toHaveLength(2);
    expect(results[0]!.type).toBe("message");
    expect(results[1]!.type).toBe("message");
    expect(results[0]!.date).toBeGreaterThanOrEqual(results[1]!.date);
  });

  it("includes file results with metadata", async () => {
    mockSelect
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { type: "file", id: "f1", title: "invoice.pdf", snippet: null, date: 3000, rank: 0, account_id: "acc-1", metadata: JSON.stringify({ category: "Invoices", size: 1234 }) },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const results = await unifiedSearch("invoice", "acc-1");
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("file");
    expect(results[0]!.title).toBe("invoice.pdf");
  });

  it("includes task results", async () => {
    mockSelect
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { type: "task", id: "t1", title: "Review proposal", snippet: "Need to review", date: 4000, rank: 0, account_id: "acc-1", metadata: JSON.stringify({ is_completed: 0 }) },
      ])
      .mockResolvedValueOnce([]);

    const results = await unifiedSearch("proposal", "acc-1");
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("task");
    expect(results[0]!.title).toBe("Review proposal");
  });

  it("includes contact results", async () => {
    mockSelect
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { type: "contact", id: "c1", title: "John Doe", snippet: "john@example.com", date: 5000, rank: 0, account_id: null, metadata: JSON.stringify({ email: "john@example.com" }) },
      ]);

    const results = await unifiedSearch("john", "acc-1");
    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe("contact");
    expect(results[0]!.title).toBe("John Doe");
  });

  it("places messages before other types regardless of date", async () => {
    mockSelect
      .mockResolvedValueOnce([
        { type: "message", id: "m1", title: "Old msg", snippet: null, date: 100, rank: 1, account_id: "acc-1", metadata: "{}" },
      ])
      .mockResolvedValueOnce([
        { type: "file", id: "f1", title: "new file", snippet: null, date: 9999, rank: 0, account_id: "acc-1", metadata: "{}" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const results = await unifiedSearch("test", "acc-1");
    expect(results).toHaveLength(2);
    expect(results[0]!.type).toBe("message");
    expect(results[1]!.type).toBe("file");
  });

  it("limits results to specified limit", async () => {
    const manyMessages = Array.from({ length: 30 }, (_, i) => ({
      type: "message" as const,
      id: `m${i}`,
      title: `Subject ${i}`,
      snippet: null,
      date: 1000 + i,
      rank: i + 1,
      account_id: "acc-1",
      metadata: "{}",
    }));
    mockSelect.mockResolvedValueOnce(manyMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const results = await unifiedSearch("test", "acc-1", 10);
    expect(results).toHaveLength(10);
  });
});
