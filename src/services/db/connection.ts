import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:velo.db");
    // Enable WAL mode for better concurrent read/write performance
    for (let i = 0; i < 3; i++) {
      try {
        await db.execute("PRAGMA journal_mode=WAL");
        console.log("[DB] WAL mode: enabled");
        break;
      } catch {
        if (i === 2) throw new Error("Failed to enable WAL journal mode");
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
    // Set busy timeout to 5 seconds so SQLite waits before returning BUSY
    for (let i = 0; i < 3; i++) {
      try {
        await db.execute("PRAGMA busy_timeout=5000");
        console.log("[DB] busy_timeout: 5000ms");
        break;
      } catch {
        if (i === 2) throw new Error("Failed to set busy_timeout");
        await new Promise((r) => setTimeout(r, 100 * (i + 1)));
      }
    }
    // Enable foreign keys
    try {
      await db.execute("PRAGMA foreign_keys=ON");
      console.log("[DB] foreign_keys: ON");
    } catch {
      // Some builds may not support foreign keys — non-fatal
    }
  }
  return db;
}

/**
 * Build a dynamic SQL UPDATE statement from a set of field updates.
 * Returns null if no fields to update.
 */
const SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateIdentifier(name: string): void {
  if (!SAFE_IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
}

export function buildDynamicUpdate(
  table: string,
  idColumn: string,
  id: unknown,
  fields: [string, unknown][],
): { sql: string; params: unknown[] } | null {
  if (fields.length === 0) return null;

  validateIdentifier(table);
  validateIdentifier(idColumn);

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [column, value] of fields) {
    validateIdentifier(column);
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

function isBusyError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("sqlite_busy") ||
    msg.includes("database is locked") ||
    msg.includes("busy")
  );
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [100, 200, 400];

export async function withTransaction(fn: (db: Database) => Promise<void>): Promise<void> {
  // Queue this transaction behind any currently-running one.
  // This serialises all transactions without blocking non-transactional reads.
  const prev = txQueue;
  let resolve!: () => void;
  txQueue = new Promise<void>((r) => {
    resolve = r;
  });

  try {
    await prev; // wait for previous transaction to finish
  } catch {
    // previous transaction errored — that's fine, we can still proceed
  }

  const database = await getDb();

  let lastError: unknown;
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delayMs = RETRY_DELAYS[attempt - 1] ?? 400;
        await new Promise((r) => setTimeout(r, delayMs));
      }

      try {
        await database.execute("BEGIN TRANSACTION", []);
        try {
          await fn(database);
          await database.execute("COMMIT", []);
          return; // success — exit retry loop
        } catch (err) {
          lastError = err;
          // SQLite may auto-rollback on certain errors — guard against
          // "cannot rollback - no transaction is active"
          try {
            await database.execute("ROLLBACK", []);
          } catch {
            // ROLLBACK failed (already rolled back) — safe to ignore
          }

          if (isBusyError(err) && attempt < MAX_RETRIES) {
            continue;
          }
          throw err;
        }
      } catch (err) {
        if (err === lastError) throw err;
        lastError = err;
        if (isBusyError(err) && attempt < MAX_RETRIES) {
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  } finally {
    resolve(); // always unblock the next queued transaction
  }
}

/**
 * Execute a query with retry logic for BUSY errors.
 * Use this for single queries outside of transactions, or pass a callback
 * for multi-statement operations that should be retried as a unit.
 */
export async function queryWithRetry<T>(
  fn: (db: Database) => Promise<T>,
  maxRetries: number = 5,
): Promise<T> {
  const database = await getDb();
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(database);
    } catch (err) {
      lastError = err;
      if (isBusyError(err) && attempt < maxRetries) {
        const delayMs = Math.min(50 * 2 ** attempt, 1000);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

/**
 * Execute a SELECT query and return the first result or null.
 */
export async function selectFirstBy<T>(
  query: string,
  params: unknown[] = [],
): Promise<T | null> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<T[]>(query, params);
    return rows[0] ?? null;
  });
}

/**
 * Execute a COUNT(*) query and return whether any rows exist.
 */
export async function existsBy(
  query: string,
  params: unknown[] = [],
): Promise<boolean> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ count: number }[]>(query, params);
    return (rows[0]?.count ?? 0) > 0;
  });
}

/**
 * Convert a boolean to SQLite integer (0 or 1).
 */
export function boolToInt(value: boolean | undefined | null): number {
  return value ? 1 : 0;
}