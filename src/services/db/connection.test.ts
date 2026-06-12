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

  it("runs the callback with the database instance", async () => {
    let receivedDb: unknown;
    await withTransaction(async (db) => {
      receivedDb = db;
    });

    expect(receivedDb).toBe(mockDb);
  });

  it("does not issue BEGIN/COMMIT — tauri-plugin-sql pools connections, so a transaction can orphan a write lock", async () => {
    const statements: string[] = [];
    mockExecute.mockImplementation(async (sql: string) => {
      statements.push(sql);
    });

    await withTransaction(async (db) => {
      await db.execute("INSERT INTO t VALUES (1)", []);
    });

    expect(statements).toEqual(["INSERT INTO t VALUES (1)"]);
  });

  it("propagates callback errors", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");
  });

  it("serialises concurrent batches via mutex", async () => {
    const executionLog: string[] = [];

    // Launch two batches concurrently
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

    // tx1 should fully complete before tx2 starts
    expect(executionLog).toEqual(["tx1-work", "tx1-done", "tx2-work"]);
  });

  it("unblocks next batch even if current one fails", async () => {
    // First batch fails
    const tx1 = withTransaction(async () => {
      throw new Error("tx1 failed");
    }).catch(() => {
      /* expected */
    });

    // Second batch should still run
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
