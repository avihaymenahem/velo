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

  it("executes callback", async () => {
    let callbackRan = false;
    await withTransaction(async () => {
      callbackRan = true;
    });

    expect(callbackRan).toBe(true);
  });

  it("propagates callback error", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");
  });

  it("serialises concurrent transactions via mutex", async () => {
    const executionLog: string[] = [];

    // Launch two transactions concurrently
    const tx1 = withTransaction(async () => {
      executionLog.push("tx1-start");
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      executionLog.push("tx1-done");
    });

    const tx2 = withTransaction(async () => {
      executionLog.push("tx2-start");
      executionLog.push("tx2-done");
    });

    await Promise.all([tx1, tx2]);

    // tx1 should fully complete before tx2 starts
    expect(executionLog).toEqual([
      "tx1-start",
      "tx1-done",
      "tx2-start",
      "tx2-done",
    ]);
  });

  it("unblocks next transaction even if current one fails", async () => {
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
