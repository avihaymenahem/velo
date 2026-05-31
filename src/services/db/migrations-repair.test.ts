import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { runMigrations } from "./migrations";

const BASE_LABEL_COLUMNS = [
  "id",
  "account_id",
  "name",
  "type",
  "color_bg",
  "color_fg",
  "visible",
  "sort_order",
];

const IMAP_LABEL_COLUMNS = [
  ...BASE_LABEL_COLUMNS,
  "imap_folder_path",
  "imap_special_use",
];

function createMockDb(options: {
  appliedVersions: number[];
  labelColumns: string[];
  duplicateColumns?: string[];
}) {
  const migrations = new Set(options.appliedVersions);
  const labelColumns = new Set(options.labelColumns);
  const duplicateColumns = new Set(options.duplicateColumns ?? []);
  const executedSql: string[] = [];

  return {
    migrations,
    executedSql,
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      executedSql.push(sql);

      if (sql.includes("DELETE FROM _migrations WHERE version = 14")) {
        migrations.delete(14);
        return { rowsAffected: 1 };
      }

      if (sql.includes("DELETE FROM _migrations WHERE version = 18")) {
        migrations.delete(18);
        return { rowsAffected: 1 };
      }

      const addColumnMatch = sql.match(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i);
      if (addColumnMatch) {
        const key = `${addColumnMatch[1]}.${addColumnMatch[2]}`;
        if (duplicateColumns.has(key)) {
          throw new Error(`duplicate column name: ${addColumnMatch[2]}`);
        }
        if (key === "labels.imap_folder_path") {
          labelColumns.add("imap_folder_path");
        }
        if (key === "labels.imap_special_use") {
          labelColumns.add("imap_special_use");
        }
      }

      if (sql.includes("INSERT OR IGNORE INTO _migrations") && params) {
        migrations.add(params[0] as number);
      }

      return { rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT version FROM _migrations")) {
        return [...migrations]
          .sort((a, b) => a - b)
          .map((version) => ({ version }));
      }

      if (sql.includes("PRAGMA table_info(labels)")) {
        return [...labelColumns].map((name) => ({ name }));
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

describe("runMigrations migration repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-runs only v14 when migration 14 is marked applied but imap_folder_path is missing", async () => {
    const mockDb = createMockDb({
      appliedVersions: Array.from({ length: 23 }, (_, index) => index + 1),
      labelColumns: BASE_LABEL_COLUMNS,
    });
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    expect(mockDb.executedSql).toContain("DELETE FROM _migrations WHERE version = 14");
    expect(mockDb.executedSql.some((sql) => (
      sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path")
    ))).toBe(true);
    expect(mockDb.migrations.has(14)).toBe(true);
    expect(mockDb.migrations.has(23)).toBe(true);
    expect(mockDb.executedSql.some((sql) => sql.includes("DELETE FROM attachments"))).toBe(false);
    expect(mockDb.executedSql.some((sql) => sql.includes("DELETE FROM folder_sync_state"))).toBe(false);
  });

  it("does not repair when imap_folder_path already exists", async () => {
    const mockDb = createMockDb({
      appliedVersions: Array.from({ length: 23 }, (_, index) => index + 1),
      labelColumns: IMAP_LABEL_COLUMNS,
    });
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    expect(mockDb.executedSql).not.toContain("DELETE FROM _migrations WHERE version = 14");
    expect(mockDb.executedSql.some((sql) => (
      sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path")
    ))).toBe(false);
  });

  it("does not repair when migration 14 has not been applied yet", async () => {
    const mockDb = createMockDb({
      appliedVersions: Array.from({ length: 13 }, (_, index) => index + 1),
      labelColumns: BASE_LABEL_COLUMNS,
    });
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    expect(mockDb.executedSql).not.toContain("DELETE FROM _migrations WHERE version = 14");
    expect(mockDb.executedSql.some((sql) => (
      sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path")
    ))).toBe(true);
  });

  it("recovers when migration 14 partially persisted other columns before failing", async () => {
    const mockDb = createMockDb({
      appliedVersions: Array.from({ length: 23 }, (_, index) => index + 1),
      labelColumns: BASE_LABEL_COLUMNS,
      duplicateColumns: [
        "accounts.provider",
        "accounts.imap_host",
        "accounts.imap_port",
        "accounts.imap_security",
        "accounts.smtp_host",
        "accounts.smtp_port",
        "accounts.smtp_security",
        "accounts.auth_method",
        "accounts.imap_password",
        "messages.message_id_header",
        "messages.references_header",
        "messages.in_reply_to_header",
        "messages.imap_uid",
        "messages.imap_folder",
      ],
    });
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);

    await runMigrations();

    expect(mockDb.executedSql).toContain("DELETE FROM _migrations WHERE version = 14");
    expect(mockDb.executedSql.some((sql) => (
      sql.includes("ALTER TABLE labels ADD COLUMN imap_folder_path")
    ))).toBe(true);
    expect(mockDb.migrations.has(14)).toBe(true);
    expect(mockDb.executedSql.some((sql) => sql.includes("DELETE FROM attachments"))).toBe(false);
    expect(mockDb.executedSql.some((sql) => sql.includes("DELETE FROM folder_sync_state"))).toBe(false);
  });
});
