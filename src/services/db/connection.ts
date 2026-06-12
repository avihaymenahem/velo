import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:velo.db");
  }
  return db;
}

/**
 * Build a dynamic SQL UPDATE statement from a set of field updates.
 * Returns null if no fields to update.
 */
export function buildDynamicUpdate(
  table: string,
  idColumn: string,
  id: unknown,
  fields: [string, unknown][],
): { sql: string; params: unknown[] } | null {
  if (fields.length === 0) return null;

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [column, value] of fields) {
    sets.push(`${column} = $${idx++}`);
    params.push(value);
  }

  params.push(id);
  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = $${idx}`,
    params,
  };
}

/**
 * Run a write batch, serialised behind any other running batch.
 *
 * NOTE: this intentionally does NOT open a SQL transaction. tauri-plugin-sql
 * runs every `execute` call on a sqlx connection pool, so BEGIN/COMMIT issued
 * as separate statements can land on different pooled connections. When that
 * happens, the connection that received BEGIN returns to the pool with an
 * open write transaction and holds the SQLite write lock forever — every
 * subsequent write in the app then stalls for the 5s busy timeout and fails.
 * Statements run sequentially in autocommit mode instead; callers must keep
 * batches idempotent (upserts), since a crash mid-batch leaves partial writes.
 */
let txQueue: Promise<void> = Promise.resolve();

export async function withTransaction(fn: (db: Database) => Promise<void>): Promise<void> {
  // Queue this batch behind any currently-running one.
  const prev = txQueue;
  let resolve!: () => void;
  txQueue = new Promise<void>((r) => {
    resolve = r;
  });

  try {
    await prev; // wait for previous batch to finish
  } catch {
    // previous batch errored — that's fine, we can still proceed
  }

  try {
    const database = await getDb();
    await fn(database);
  } finally {
    resolve(); // always unblock the next queued batch
  }
}

/**
 * Execute a SELECT query and return the first result or null.
 */
export async function selectFirstBy<T>(
  query: string,
  params: unknown[] = [],
): Promise<T | null> {
  const db = await getDb();
  const rows = await db.select<T[]>(query, params);
  return rows[0] ?? null;
}

/**
 * Execute a COUNT(*) query and return whether any rows exist.
 */
export async function existsBy(
  query: string,
  params: unknown[] = [],
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(query, params);
  return (rows[0]?.count ?? 0) > 0;
}

/**
 * Convert a boolean to SQLite integer (0 or 1).
 */
export function boolToInt(value: boolean | undefined | null): number {
  return value ? 1 : 0;
}
