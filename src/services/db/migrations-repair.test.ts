import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { runMigrations } from "./migrations";

const LABELS_BASE_COLUMNS = [
  "id", "account_id", "name", "type", "color_bg", "color_fg", "visible", "sort_order",
];

const LABELS_IMAP_COLUMNS = [
  ...LABELS_BASE_COLUMNS, "imap_folder_path", "imap_special_use",
];

function createStatefulMockDb(opts: {
  appliedVersions: number[];
  labelColumns: string[];
}) {
  const migrations = new Set(opts.appliedVersions);
  const executedSql: string[] = [];

  return {
    migrations,
    executedSql,
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      executedSql.push(sql);

      if (sql.includes("INSERT OR IGNORE INTO _migrations") && params) {
        migrations.add(params[0] as number);
      }
      if (sql.includes("DELETE FROM _migrations WHERE version >= 14")) {
        for (let v = 14; v <= 30; v++) migrations.delete(v);
      }
      if (sql.includes("DELETE FROM _migrations WHERE version = 18")) {
        migrations.delete(18);
      }

      return { rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT version FROM _migrations")) {
        return [...migrations].sort((a, b) => a - b).map((v) => ({ version: v }));
      }
      if (sql.includes("PRAGMA table_info(labels)")) {
        return opts.labelColumns.map((name) => ({ name }));
      }
      if (sql.includes("sqlite_master") && sql.includes("tasks")) {
        return [{ name: "tasks" }];
      }
      if (sql.includes("imap_attachment_repair_v1")) {
        return [{ value: "1" }];
      }
      return [];
    }),
  };
}

describe("runMigrations v14 repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-runs migration 14+ when marked applied but imap_folder_path column is missing", async () => {
    const mockDb = createStatefulMockDb({
      appliedVersions: Array.from({ length: 23 }, (_, i) => i + 1),
      labelColumns: LABELS_BASE_COLUMNS,
    });

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    expect(mockDb.executedSql).toContain(
      "DELETE FROM _migrations WHERE version >= 14",
    );

    const reRanV14 = mockDb.executedSql.some(
      (sql) => sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path"),
    );
    expect(reRanV14).toBe(true);
  });

  it("does not repair when imap_folder_path column already exists", async () => {
    const mockDb = createStatefulMockDb({
      appliedVersions: Array.from({ length: 23 }, (_, i) => i + 1),
      labelColumns: LABELS_IMAP_COLUMNS,
    });

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    const deletedV14 = mockDb.executedSql.some(
      (sql) => sql.includes("DELETE FROM _migrations WHERE version >= 14"),
    );
    expect(deletedV14).toBe(false);

    const ranV14Sql = mockDb.executedSql.some(
      (sql) => sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path"),
    );
    expect(ranV14Sql).toBe(false);
  });

  it("does not repair when migration 14 has not been applied yet", async () => {
    const mockDb = createStatefulMockDb({
      appliedVersions: Array.from({ length: 13 }, (_, i) => i + 1),
      labelColumns: LABELS_BASE_COLUMNS,
    });

    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    const deletedV14 = mockDb.executedSql.some(
      (sql) => sql.includes("DELETE FROM _migrations WHERE version >= 14"),
    );
    expect(deletedV14).toBe(false);

    const ranV14Sql = mockDb.executedSql.some(
      (sql) => sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path"),
    );
    expect(ranV14Sql).toBe(true);
  });
});
