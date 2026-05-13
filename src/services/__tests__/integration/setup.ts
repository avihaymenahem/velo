import { DatabaseSync } from "node:sqlite";

export const dbRef: { current: MockTauriDb | null } = { current: null };

export class MockTauriDb {
  private db: DatabaseSync;
  private _isOpen = true;

  constructor() {
    this.db = new DatabaseSync(":memory:");
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId?: number }> {
    this.ensureOpen();
    const { sql: converted, params: expanded } = this.convertParams(sql, params);
    if (expanded.length === 0) {
      this.db.exec(converted);
      return { rowsAffected: 0 };
    }
    const stmt = this.db.prepare(converted);
    const result = stmt.run(...expanded);
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) || undefined };
  }

  async select<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureOpen();
    const { sql: converted, params: expanded } = this.convertParams(sql, params);
    if (expanded.length === 0) {
      const stmt = this.db.prepare(converted);
      return stmt.all() as unknown as T[];
    }
    const stmt = this.db.prepare(converted);
    return stmt.all(...expanded) as unknown as T[];
  }

  close(): void {
    if (this._isOpen) {
      this.db.close();
      this._isOpen = false;
    }
  }

  private ensureOpen(): void {
    if (!this._isOpen) throw new Error("Database is closed");
  }

  private convertParams(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
    const paramMap = new Map<number, number[]>();
    let pos = 0;
    const newSql = sql.replace(/\$(\d+)/g, (_match: string, num: string) => {
      const idx = parseInt(num, 10);
      if (idx === 0) return "?";
      const positions = paramMap.get(idx) ?? [];
      positions.push(pos++);
      paramMap.set(idx, positions);
      return "?";
    });
    if (paramMap.size === 0) {
      return { sql, params };
    }
    const expandedParams: unknown[] = [];
    for (const [idx, positions] of paramMap) {
      let value: unknown;
      if (idx - 1 < params.length) {
        value = params[idx - 1];
      }
      if (value === undefined) value = null;
      for (const p of positions) {
        expandedParams[p] = value;
      }
    }
    return { sql: newSql, params: expandedParams };
  }
}

export function freshTestDb(): MockTauriDb {
  if (dbRef.current) {
    dbRef.current.close();
  }
  const db = new MockTauriDb();
  dbRef.current = db;
  return db;
}

export async function runMigrations(): Promise<void> {
  const { runMigrations: realRun } = await import("@/services/db/migrations");
  await realRun();
  const db = dbRef.current!;
  try {
    await db.execute("ALTER TABLE pending_operations ADD COLUMN hold_until INTEGER");
  } catch {
    // Column may already exist in some schemas
  }
  try {
    await db.execute("PRAGMA foreign_keys=OFF");
  } catch {
    // Non-fatal
  }
}

const TEST_ACCOUNT_ID = "test-account-1";

export function getTestAccountId(): string {
  return TEST_ACCOUNT_ID;
}

export async function seedAccount(overrides: Record<string, unknown> = {}): Promise<void> {
  const db = dbRef.current!;
  const id = (overrides.id as string) ?? TEST_ACCOUNT_ID;
  const email = (overrides.email as string) ?? "test@example.com";
  const provider = (overrides.provider as string) ?? "gmail_api";
  const imapHost = (overrides.imap_host as string) ?? null;
  const imapPort = (overrides.imap_port as number) ?? null;
  const imapSecurity = (overrides.imap_security as string) ?? null;
  const smtpHost = (overrides.smtp_host as string) ?? null;
  const smtpPort = (overrides.smtp_port as number) ?? null;
  const smtpSecurity = (overrides.smtp_security as string) ?? null;
  const authMethod = (overrides.auth_method as string) ?? "oauth";
  const accessToken = (overrides.access_token as string) ?? null;
  const refreshToken = (overrides.refresh_token as string) ?? null;

  await db.execute(
    `INSERT INTO accounts (id, email, provider, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, auth_method, access_token, refresh_token, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, unixepoch(), unixepoch())`,
    [id, email, provider, imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, authMethod, accessToken, refreshToken],
  );
}

export async function getTestAccount(): Promise<Record<string, unknown> | null> {
  const db = dbRef.current!;
  const rows = await db.select<Record<string, unknown>>("SELECT * FROM accounts WHERE id = $1", [TEST_ACCOUNT_ID]);
  return rows[0] ?? null;
}

export async function getTestMessages(accountId?: string): Promise<Record<string, unknown>[]> {
  const db = dbRef.current!;
  return db.select<Record<string, unknown>>(
    "SELECT * FROM messages WHERE account_id = $1 ORDER BY date ASC",
    [accountId ?? TEST_ACCOUNT_ID],
  );
}

export async function getTestThreads(accountId?: string): Promise<Record<string, unknown>[]> {
  const db = dbRef.current!;
  return db.select<Record<string, unknown>>(
    "SELECT * FROM threads WHERE account_id = $1 ORDER BY last_message_at DESC",
    [accountId ?? TEST_ACCOUNT_ID],
  );
}
