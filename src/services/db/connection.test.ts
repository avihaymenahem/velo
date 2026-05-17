import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Database before importing module under test
const mockExecute = vi.fn();
const mockSelect = vi.fn();
const mockDb = { execute: mockExecute, select: mockSelect };

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => Promise.resolve(mockDb)),
  },
}));

// Use dynamic import so mocks are in place
const { withTransaction, getDb } = await import("./connection");

describe("withTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
  });

  it("executes callback within mutex serialization", async () => {
    const callOrder: string[] = [];
    
    await withTransaction(async () => {
      callOrder.push("callback");
    });

    expect(callOrder).toContain("callback");
  });

  it("propagates callback error and unblocks queue", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");

    let secondRan = false;
    await withTransaction(async () => {
      secondRan = true;
    });
    expect(secondRan).toBe(true);
  });

  it("serialises concurrent operations via mutex", async () => {
    const executionLog: string[] = [];

    // Launch two transactions concurrently
    const tx1 = withTransaction(async () => {
      executionLog.push("tx1-start");
      await new Promise((r) => setTimeout(r, 20));
      executionLog.push("tx1-end");
    });

    const tx2 = withTransaction(async () => {
      executionLog.push("tx2-work");
    });

    await Promise.all([tx1, tx2]);

    // tx1 should fully complete (start, end) before tx2 starts (work)
    const tx1StartIdx = executionLog.indexOf("tx1-start");
    const tx1EndIdx = executionLog.indexOf("tx1-end");
    const tx2WorkIdx = executionLog.indexOf("tx2-work");

    expect(tx1StartIdx).toBeLessThan(tx1EndIdx);
    expect(tx1EndIdx).toBeLessThan(tx2WorkIdx);
  });
});

describe("getDb", () => {
  it("returns the same instance on repeated calls", async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });
});
