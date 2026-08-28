import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
    withTransaction: vi.fn(),
  };
});
vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("@/services/db/accounts", () => ({
  getAllAccounts: vi.fn(),
}));
vi.mock("@/services/db/sendAsAliases", () => ({
  getAliasesForAccount: vi.fn(),
}));

import { getDb, withTransaction } from "@/services/db/connection";
import { getSetting, setSetting } from "@/services/db/settings";
import { getAllAccounts } from "@/services/db/accounts";
import { getAliasesForAccount } from "@/services/db/sendAsAliases";
import { mineContactsForAccount, mineContactsForAllAccounts } from "./contactMining";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

const ACCOUNT = { id: "acct-1", email: "me@example.com", provider: "gmail" };

describe("contactMining", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
    vi.mocked(withTransaction).mockImplementation(async (fn) => {
      await fn(mockDb as never);
    });
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getAllAccounts).mockResolvedValue([ACCOUNT] as never);
    vi.mocked(getAliasesForAccount).mockResolvedValue([]);
  });

  it("returns 0 and writes no watermark when there are no new messages", async () => {
    mockDb.select.mockResolvedValueOnce([{ max_rowid: null, cnt: 0 }] as never);

    const scanned = await mineContactsForAccount("acct-1");

    expect(scanned).toBe(0);
    expect(setSetting).not.toHaveBeenCalled();
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("reads the watermark before mining and advances it after both passes", async () => {
    vi.mocked(getSetting).mockResolvedValue("42");
    mockDb.select
      .mockResolvedValueOnce([{ max_rowid: 100, cnt: 7 }] as never) // bounds query
      .mockResolvedValueOnce([] as never); // pass B sent-mail query

    const scanned = await mineContactsForAccount("acct-1");

    expect(scanned).toBe(7);
    expect(getSetting).toHaveBeenCalledWith("contacts_mined_rowid:acct-1");
    // Bounds query is windowed from the stored watermark
    expect(mockDb.select).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("MAX(rowid)"),
      ["acct-1", 42],
    );
    expect(setSetting).toHaveBeenCalledWith("contacts_mined_rowid:acct-1", "100");
  });

  it("pass A upserts senders with conflict handling and exclusions", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ max_rowid: 10, cnt: 3 }] as never)
      .mockResolvedValueOnce([] as never);

    await mineContactsForAccount("acct-1");

    const [sql, params] = vi.mocked(mockDb.execute).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT(email) DO UPDATE");
    expect(sql).toContain("GROUP BY lower(trim(from_address))");
    // Unmailable prefixes excluded in SQL, generated from the shared list
    expect(sql).toContain("NOT LIKE 'noreply%'");
    expect(sql).toContain("NOT LIKE 'bounce%'");
    // User-edited names are never clobbered
    expect(sql).toContain("COALESCE(contacts.display_name, excluded.display_name)");
    // Own address excluded via params
    expect(params).toContain("me@example.com");
  });

  it("pass B parses sent-mail headers and chunk-upserts recipients inside a transaction", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ max_rowid: 10, cnt: 2 }] as never)
      .mockResolvedValueOnce([
        {
          to_addresses: '"Doe, John" <john@example.com>, kate@example.com',
          cc_addresses: "noreply@example.com, me@example.com",
          date: 1000,
        },
        { to_addresses: "john@example.com", cc_addresses: null, date: 2000 },
      ] as never);

    await mineContactsForAccount("acct-1");

    expect(withTransaction).toHaveBeenCalledTimes(1);
    const insertCall = vi
      .mocked(mockDb.execute)
      .mock.calls.find(([sql]) => String(sql).includes("VALUES") && String(sql).includes("ON CONFLICT(email)"));
    expect(insertCall).toBeDefined();
    const [insertSql, params] = insertCall as unknown as [string, unknown[]];
    // john (count 2, name from parse) and kate present; noreply + self excluded
    expect(params).toContain("john@example.com");
    expect(params).toContain("kate@example.com");
    expect(params).toContain("Doe, John");
    expect(params).not.toContain("noreply@example.com");
    expect(params).not.toContain("me@example.com");
    // last_contacted_at rides in the same statement — no per-row UPDATE loop
    expect(insertSql).toContain("excluded.last_contacted_at");
    expect(params).toContain(2000);
  });

  it("yields to sync between windows and keeps completed watermarks", async () => {
    // 30k rows pending -> two windows, but shouldYield turns true after the first
    const shouldYield = vi.fn()
      .mockReturnValueOnce(false) // initial check
      .mockReturnValueOnce(false) // window 1
      .mockReturnValueOnce(true); // window 2 -> stop
    mockDb.select
      .mockResolvedValueOnce([{ max_rowid: 30000, cnt: 30000 }] as never)
      .mockResolvedValueOnce([] as never); // window 1 sent-mail query

    await mineContactsForAccount("acct-1", { shouldYield });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledTimes(1);
    expect(setSetting).toHaveBeenCalledWith("contacts_mined_rowid:acct-1", "20000");
  });

  it("does not advance the watermark when a window's writes fail", async () => {
    mockDb.select
      .mockResolvedValueOnce([{ max_rowid: 10, cnt: 1 }] as never)
      .mockResolvedValueOnce([
        { to_addresses: "a@b.com", cc_addresses: null, date: 1 },
      ] as never);
    vi.mocked(withTransaction).mockRejectedValueOnce(new Error("db locked"));

    await expect(mineContactsForAccount("acct-1")).rejects.toThrow("db locked");
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("processes large backlogs in rowid windows with one transaction each", async () => {
    // 30k rows pending -> two windows: (0, 20000], (20000, 30000]
    mockDb.select
      .mockResolvedValueOnce([{ max_rowid: 30000, cnt: 30000 }] as never)
      .mockResolvedValueOnce([] as never) // window 1 sent-mail query
      .mockResolvedValueOnce([] as never); // window 2 sent-mail query

    await mineContactsForAccount("acct-1");

    expect(withTransaction).toHaveBeenCalledTimes(2);
    // Watermark advances after each window, making an interrupted run resumable
    expect(setSetting).toHaveBeenNthCalledWith(1, "contacts_mined_rowid:acct-1", "20000");
    expect(setSetting).toHaveBeenNthCalledWith(2, "contacts_mined_rowid:acct-1", "30000");
    // Pass A is bounded to each window
    const passACalls = vi
      .mocked(mockDb.execute)
      .mock.calls.filter(([sql]) => String(sql).includes("GROUP BY"));
    expect(passACalls.map(([, params]) => (params as unknown[]).slice(1, 3))).toEqual([
      [0, 20000],
      [20000, 30000],
    ]);
  });

  it("mineContactsForAllAccounts skips caldav accounts and swallows per-account errors", async () => {
    vi.mocked(getAllAccounts).mockResolvedValue([
      { id: "a1", email: "a@x.com", provider: "caldav" },
      { id: "a2", email: "b@x.com", provider: "gmail" },
    ] as never);
    // a2 bounds query returns nothing new
    mockDb.select.mockResolvedValue([{ max_rowid: null, cnt: 0 }] as never);

    await expect(mineContactsForAllAccounts()).resolves.toBeUndefined();
    // Only a2 was mined (one bounds query)
    expect(getSetting).toHaveBeenCalledTimes(1);
    expect(getSetting).toHaveBeenCalledWith("contacts_mined_rowid:a2");
  });
});
