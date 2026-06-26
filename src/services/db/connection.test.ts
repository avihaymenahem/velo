import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

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

// Pre-warm the singleton so its one-time PRAGMA init (journal_mode/busy_timeout/
// synchronous) runs before any test installs its own spy expectations.
beforeAll(async () => {
  await getDb();
});

describe("withTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
  });

  // NOTE: withTransaction no longer issues BEGIN/COMMIT — real transactions are
  // impossible with the plugin's per-call connection pool (they made every write
  // block ~5s on the BEGIN's dangling lock). It now just runs the callback, and
  // write serialisation happens at the db.execute level (see below).

  it("runs the callback with the db handle", async () => {
    const db = await getDb();
    let received: unknown;
    await withTransaction(async (txDb) => {
      received = txDb;
    });
    expect(received).toBe(db);
  });

  it("propagates errors from the callback", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("callback failed");
      }),
    ).rejects.toThrow("callback failed");
  });
});

describe("db.execute serialisation + busy retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
  });

  it("serialises concurrent writes so only one runs at a time", async () => {
    const db = await getDb();
    let active = 0;
    let maxConcurrent = 0;
    mockExecute.mockImplementation(async () => {
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });

    await Promise.all([
      db.execute("INSERT 1"),
      db.execute("INSERT 2"),
      db.execute("INSERT 3"),
    ]);

    expect(maxConcurrent).toBe(1);
  });

  it("retries on SQLITE_BUSY (code 5) then succeeds", async () => {
    const db = await getDb();
    let calls = 0;
    mockExecute.mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error("error returned from database: (code: 5) database is locked");
      return undefined;
    });

    await db.execute("INSERT x");
    expect(calls).toBe(3);
  });

  it("does not retry non-lock errors", async () => {
    const db = await getDb();
    let calls = 0;
    mockExecute.mockImplementation(async () => {
      calls++;
      throw new Error("syntax error");
    });

    await expect(db.execute("INSERT x")).rejects.toThrow("syntax error");
    expect(calls).toBe(1);
  });

  it("keeps the write queue alive after a failed write", async () => {
    const db = await getDb();
    mockExecute.mockRejectedValueOnce(new Error("boom"));

    await expect(db.execute("first")).rejects.toThrow("boom");

    // A subsequent write should still go through (queue not wedged).
    mockExecute.mockResolvedValueOnce(undefined);
    await expect(db.execute("second")).resolves.toBeUndefined();
  });
});

describe("getDb", () => {
  it("returns the same instance on repeated calls", async () => {
    const db1 = await getDb();
    const db2 = await getDb();
    expect(db1).toBe(db2);
  });
});
