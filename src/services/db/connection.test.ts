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

  it("executes BEGIN, callback, COMMIT in order", async () => {
    const callOrder: string[] = [];
    mockExecute.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
    });

    await withTransaction(async () => {
      callOrder.push("callback");
    });

    expect(callOrder).toEqual(["BEGIN TRANSACTION", "callback", "COMMIT"]);
  });

  it("rolls back on callback error", async () => {
    const callOrder: string[] = [];
    mockExecute.mockImplementation(async (sql: string) => {
      callOrder.push(sql);
    });

    await expect(
      withTransaction(async () => {
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");

    expect(callOrder).toEqual(["BEGIN TRANSACTION", "ROLLBACK"]);
  });

  it("handles ROLLBACK failure gracefully (SQLite auto-rollback)", async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") {
        throw new Error("cannot rollback - no transaction is active");
      }
    });

    // Should still throw the original error, not the ROLLBACK error
    await expect(
      withTransaction(async () => {
        throw new Error("original error");
      }),
    ).rejects.toThrow("original error");
  });

  it("serialises concurrent transactions via mutex", async () => {
    const executionLog: string[] = [];

    mockExecute.mockImplementation(async (sql: string) => {
      executionLog.push(sql);
    });

    // Launch two transactions concurrently
    const tx1 = withTransaction(async () => {
      executionLog.push("tx1-work");
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      executionLog.push("tx1-done");
    });

    const tx2 = withTransaction(async () => {
      executionLog.push("tx2-work");
    });

    await Promise.all([tx1, tx2]);

    // tx1 should fully complete (BEGIN, work, done, COMMIT) before tx2 starts
    const tx1BeginIdx = executionLog.indexOf("BEGIN TRANSACTION");
    const tx1CommitIdx = executionLog.indexOf("COMMIT");
    const tx2BeginIdx = executionLog.lastIndexOf("BEGIN TRANSACTION");

    expect(tx1BeginIdx).toBeLessThan(tx1CommitIdx);
    expect(tx1CommitIdx).toBeLessThan(tx2BeginIdx);
  });

  it("unblocks next transaction even if current one fails", async () => {
    mockExecute.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") {
        // Simulate auto-rollback already happened
        throw new Error("cannot rollback - no transaction is active");
      }
    });

    // First transaction fails
    const tx1 = withTransaction(async () => {
      throw new Error("tx1 failed");
    }).catch(() => {
      /* expected */
    });

    // Second transaction should still run
    let tx2Ran = false;
    const tx2 = withTransaction(async () => {
      tx2Ran = true;
    });

    await Promise.all([tx1, tx2]);

    expect(tx2Ran).toBe(true);
  });
});

describe("getDb", () => {
  it("returns the same instance on repeated calls", async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });
});
