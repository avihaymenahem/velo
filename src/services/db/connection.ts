import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;
let loading: Promise<Database> | null = null;

/**
 * Returns true if an error is a SQLite "database is locked" / SQLITE_BUSY
 * (code 5). The Tauri SQL plugin surfaces these as a stringly-typed error
 * from sqlx, so we match on the message.
 */
function isLockError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("database is locked") ||
    msg.includes("code: 5") ||
    msg.includes("(code 5)") ||
    msg.includes("database table is locked")
  );
}

const BUSY_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800, 1200];

/**
 * Run a db operation, retrying on SQLITE_BUSY with exponential backoff.
 *
 * The plugin opens a multi-connection sqlx pool with no busy_timeout, so a
 * write that contends with another connection's write fails *instantly* with
 * code 5 instead of waiting. BUSY is transient (the competing writer finishes
 * in milliseconds), so retrying is effectively an app-level busy_timeout and
 * is safe: a single statement is idempotent to re-issue, and inside a
 * transaction the transaction stays open while we retry the statement.
 */
async function withBusyRetry<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (!isLockError(err) || attempt >= BUSY_RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, BUSY_RETRY_DELAYS_MS[attempt]));
    }
  }
}

/**
 * Global write serialisation.
 *
 * The Tauri SQL plugin runs every db.execute on a connection acquired from a
 * multi-connection pool *per call* (`pool.execute(query)`). Two consequences:
 *
 *  1. Writes issued "concurrently" land on different connections and collide
 *     with SQLITE_BUSY.
 *  2. Multi-statement transactions are impossible — a `BEGIN` runs on one
 *     pooled connection and is returned to the pool with the write lock held,
 *     so the transaction's own follow-up statements (on *other* connections)
 *     block on that lock for the full busy_timeout. This made every insert take
 *     ~5s during sync.
 *
 * Fix: never issue BEGIN/COMMIT (see withTransaction), and funnel every write
 * through one in-process mutex so no two writes run at once. Each statement then
 * runs as a fast autocommit on whatever pooled connection it gets — it grabs
 * the write lock, commits, and releases immediately, so nothing else is ever
 * waiting on a held lock. withBusyRetry stays as a backstop.
 */
let writeChain: Promise<unknown> = Promise.resolve();

async function serializeWrite<T>(op: () => Promise<T>): Promise<T> {
  const prev = writeChain;
  let release!: () => void;
  writeChain = new Promise<void>((r) => {
    release = r;
  });
  await prev.catch(() => {}); // wait for prior write; ignore its result/error
  try {
    return await op();
  } finally {
    release();
  }
}

export async function getDb(): Promise<Database> {
  if (db) return db;
  // Guard against concurrent callers racing Database.load (each call to the
  // singleton during startup would otherwise trigger a separate load).
  if (!loading) {
    loading = (async () => {
      const database = await Database.load("sqlite:velo.db");

      // Wrap execute/select centrally so every existing getDb().execute/select
      // call site benefits with no changes. Every write is serialised (see
      // serializeWrite) and retried on BUSY. Reads aren't serialised — WAL lets
      // them run concurrently with the single writer — but are still retried.
      const rawExecute = database.execute.bind(database);
      const rawSelect = database.select.bind(database);
      database.execute = ((query: string, bindValues?: unknown[]) =>
        serializeWrite(() => withBusyRetry(() => rawExecute(query, bindValues)))) as typeof database.execute;
      database.select = (<T>(query: string, bindValues?: unknown[]) =>
        withBusyRetry(() => rawSelect<T>(query, bindValues))) as typeof database.select;

      // The plugin opens a multi-connection sqlx pool. In the default
      // rollback-journal mode any reader blocks the writer, and with no busy
      // timeout a contended write fails instantly with SQLITE_BUSY (code 5) —
      // the "database is locked" sync error. WAL lets readers and the writer
      // run concurrently; busy_timeout makes contending writes wait instead of
      // erroring. journal_mode=WAL is persisted in the db file (set once);
      // busy_timeout/synchronous are per-connection best-effort, so the
      // withBusyRetry wrapper above is the reliable backstop.
      try {
        await database.execute("PRAGMA journal_mode=WAL");
        await database.execute("PRAGMA busy_timeout=5000");
        await database.execute("PRAGMA synchronous=NORMAL");
      } catch (err) {
        console.error("Failed to apply SQLite pragmas:", err);
      }
      db = database;
      return database;
    })();
  }
  return loading;
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
 * Run `fn` as a batch of writes.
 *
 * NOTE: despite the name, this does NOT open a SQLite transaction. Real
 * BEGIN/COMMIT is impossible with this plugin's per-call connection pool (see
 * serializeWrite) — it caused every statement to block ~5s on the BEGIN's
 * dangling lock. Instead each write inside `fn` runs as an independent,
 * serialised autocommit via the wrapped db.execute. The trade-off is loss of
 * all-or-nothing atomicity: a partially-applied batch is possible on crash, but
 * sync uses idempotent upserts and reconciles on the next pass, so this is
 * acceptable — and far better than a sync that never completes.
 *
 * Kept as a function (rather than inlined at call sites) so callers' grouping/
 * ordering reads naturally, and so atomicity can be reintroduced later if the
 * plugin ever supports pinned connections.
 */
export async function withTransaction(fn: (db: Database) => Promise<void>): Promise<void> {
  const database = await getDb();
  await fn(database);
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
