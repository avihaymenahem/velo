import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:velo.db");
    await db.execute("PRAGMA busy_timeout = 5000", []);
    await db.execute("PRAGMA journal_mode = WAL", []);
    // NORMAL is safe with WAL and much faster than FULL (no fsync on every write)
    await db.execute("PRAGMA synchronous = NORMAL", []);
    // 16 MB page cache — sufficient for local email DB with WAL mode
    await db.execute("PRAGMA cache_size = -16384", []);
    // Only auto-checkpoint after 10 000 WAL pages (~40 MB); default 1 000 pages
    // causes frequent reader-blocking checkpoints under heavy IMAP sync load
    await db.execute("PRAGMA wal_autocheckpoint = 10000", []);
    await db.execute("PRAGMA temp_store = MEMORY", []);
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
 * Simple async mutex to prevent concurrent SQLite transactions.
 * SQLite only supports one writer at a time; overlapping BEGIN/COMMIT/ROLLBACK
 * on the same connection causes "cannot start a transaction within a transaction"
 * or "database is locked" errors.
 */
let txQueue: Promise<void> = Promise.resolve();
let txLevel = 0;

export async function withTransaction(fn: (db: Database) => Promise<void>): Promise<void> {
  // If we are already nested, just run the function.
  // We rely on JS-side serialization to prevent concurrent writes.
  if (txLevel > 0) {
    txLevel++;
    try {
      const db = await getDb();
      return await fn(db);
    } finally {
      txLevel--;
    }
  }

  // Queue this operation behind any currently-running one.
  const prev = txQueue;
  let resolve!: () => void;
  txQueue = new Promise<void>((r) => {
    resolve = r;
  });

  try {
    await prev;
  } catch {
    // ignore previous task failures
  }

  const database = await getDb();
  txLevel = 1;
  try {
    // We REMOVE manual BEGIN/COMMIT here because tauri-plugin-sql uses a connection pool.
    // Raw SQL transactions can fail if queries are sent to different connections in the pool.
    // By using txQueue, we still achieve serialization of writes at the JS level.
    await fn(database);
  } catch (err) {
    console.error("[withTransaction] Operation failed:", err);
    throw err;
  } finally {
    txLevel = 0;
    resolve();
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
