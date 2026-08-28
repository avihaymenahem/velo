import { getDb, withTransaction } from "@/services/db/connection";
import type Database from "@tauri-apps/plugin-sql";
import { getSetting, setSetting } from "@/services/db/settings";
import { getAllAccounts } from "@/services/db/accounts";
import { getAliasesForAccount } from "@/services/db/sendAsAliases";
import { parseAddressList } from "@/utils/addressList";
import { isUnmailableAddress, UNMAILABLE_PREFIXES } from "@/utils/noReply";
import { normalizeEmail } from "@/utils/emailUtils";

const WATERMARK_KEY_PREFIX = "contacts_mined_rowid:";

/**
 * Rowids processed per transaction. Mining runs concurrently with sync, so
 * each window's writes must be short — a single full-mailbox scan holds the
 * write lock long enough for sync's writes to fail with SQLITE_BUSY.
 */
const MINING_WINDOW = 20_000;

/** Multi-row upsert chunk size: 5 params per row, safely under SQLite's 999 limit. */
const UPSERT_CHUNK_SIZE = 100;

interface MinedContact {
  email: string;
  name: string | null;
  count: number;
  lastDate: number;
}

export interface MiningOptions {
  /**
   * Checked before each window; when it returns true, mining stops early
   * (already-completed windows keep their watermark, so the next run resumes).
   * Used to yield to an in-flight sync instead of competing for the write lock.
   */
  shouldYield?: () => boolean;
}

/**
 * Mine the contacts table from synced messages for one account.
 *
 * Incremental via a per-account rowid watermark (rowid is monotonic on insert,
 * so back-dated messages pulled in by a folder backfill are still picked up —
 * a date watermark would skip them). Work is windowed by rowid range with each
 * window's writes inside withTransaction, serializing against the app's other
 * transactions and keeping write locks short; the watermark advances per
 * window, so an interrupted run resumes where it left off.
 *
 * Returns the number of source messages scanned.
 */
export async function mineContactsForAccount(
  accountId: string,
  opts?: MiningOptions,
): Promise<number> {
  if (opts?.shouldYield?.()) return 0;
  const db = await getDb();
  const watermarkKey = `${WATERMARK_KEY_PREFIX}${accountId}`;
  let since = parseInt((await getSetting(watermarkKey)) ?? "0", 10) || 0;

  // Capture the upper bound before mining so rows inserted by a concurrent
  // sync are never skipped — they'll be picked up by the next run.
  const maxRows = await db.select<Array<{ max_rowid: number | null; cnt: number }>>(
    "SELECT MAX(rowid) AS max_rowid, COUNT(*) AS cnt FROM messages WHERE account_id = $1 AND rowid > $2",
    [accountId, since],
  );
  const maxRowid = maxRows[0]?.max_rowid;
  const scanned = maxRows[0]?.cnt ?? 0;
  if (!maxRowid || scanned === 0) return 0;

  const selfEmails = await getSelfEmails(accountId);

  while (since < maxRowid) {
    if (opts?.shouldYield?.()) break;
    const windowEnd = Math.min(since + MINING_WINDOW, maxRowid);

    // Pass B read happens outside the transaction; only writes go inside.
    const mined = await collectSentRecipients(accountId, since, windowEnd, selfEmails);

    await withTransaction(async (tx) => {
      await mineSenders(tx, accountId, since, windowEnd, selfEmails);
      await upsertMinedContacts(tx, mined);
    });

    // Advance the watermark after each successful window. If a write fails,
    // the next run re-mines only the failed window and double-counts
    // frequency there — harmless (frequency only affects suggestion ordering).
    await setSetting(watermarkKey, String(windowEnd));
    since = windowEnd;
  }

  return scanned;
}

/** Mine contacts for every account. Intended to be fire-and-forget. */
export async function mineContactsForAllAccounts(opts?: MiningOptions): Promise<void> {
  const accounts = await getAllAccounts();
  for (const account of accounts) {
    if (account.provider === "caldav") continue;
    if (opts?.shouldYield?.()) return;
    try {
      await mineContactsForAccount(account.id, opts);
    } catch (err) {
      console.warn(`[contactMining] Mining failed for account ${account.id}:`, err);
    }
  }
}

async function getSelfEmails(accountId: string): Promise<Set<string>> {
  const self = new Set<string>();
  const accounts = await getAllAccounts();
  for (const a of accounts) {
    if (a.email) self.add(normalizeEmail(a.email));
  }
  try {
    const aliases = await getAliasesForAccount(accountId);
    for (const alias of aliases) {
      if (alias.email) self.add(normalizeEmail(alias.email));
    }
  } catch {
    // Aliases are a nice-to-have for self-exclusion; ignore lookup failures.
  }
  return self;
}

/**
 * Pass A: aggregate senders of received mail in a single SQL statement
 * over one rowid window.
 */
async function mineSenders(
  tx: Database,
  accountId: string,
  sinceRowid: number,
  maxRowid: number,
  selfEmails: Set<string>,
): Promise<void> {
  // Build the unmailable-prefix exclusion from the shared pattern list so
  // SQL and JS filtering stay in sync (single source of truth in noReply.ts).
  const prefixClauses = UNMAILABLE_PREFIXES.map(
    (p) =>
      `AND substr(lower(trim(from_address)), 1, instr(lower(trim(from_address)), '@') - 1) NOT LIKE '${p}%'`,
  ).join("\n       ");

  const selfList = [...selfEmails];
  const selfPlaceholders = selfList.map((_, i) => `$${i + 4}`).join(", ");
  const selfClause = selfList.length > 0
    ? `AND lower(trim(from_address)) NOT IN (${selfPlaceholders})`
    : "";

  // Bare from_name alongside a single MAX(date) aggregate is defined behavior
  // in SQLite: bare columns come from the row that produced the extremum,
  // i.e. the display name of the most recent message from that sender.
  await tx.execute(
    `INSERT INTO contacts (id, email, display_name, frequency, last_contacted_at, created_at, updated_at)
     SELECT
       lower(hex(randomblob(16))),
       lower(trim(from_address)),
       NULLIF(trim(trim(COALESCE(from_name, '')), '"'), ''),
       COUNT(*),
       MAX(date),
       unixepoch(),
       unixepoch()
     FROM messages
     WHERE account_id = $1
       AND rowid > $2
       AND rowid <= $3
       AND from_address IS NOT NULL
       AND instr(trim(from_address), '@') > 1
       ${selfClause}
       ${prefixClauses}
     GROUP BY lower(trim(from_address))
     ON CONFLICT(email) DO UPDATE SET
       display_name      = COALESCE(contacts.display_name, excluded.display_name),
       frequency         = contacts.frequency + excluded.frequency,
       last_contacted_at = max(COALESCE(contacts.last_contacted_at, 0), excluded.last_contacted_at),
       updated_at        = unixepoch()`,
    [accountId, sinceRowid, maxRowid, ...selfList],
  );
}

/**
 * Pass B (read half): parse To/Cc recipients of mail the user sent within one
 * rowid window (highest-value contacts). Headers are raw RFC-5322 address
 * lists, so parsing happens in JS.
 */
async function collectSentRecipients(
  accountId: string,
  sinceRowid: number,
  maxRowid: number,
  selfEmails: Set<string>,
): Promise<MinedContact[]> {
  if (selfEmails.size === 0) return [];
  const db = await getDb();

  const selfList = [...selfEmails];
  const selfPlaceholders = selfList.map((_, i) => `$${i + 4}`).join(", ");
  const rows = await db.select<Array<{ to_addresses: string | null; cc_addresses: string | null; date: number }>>(
    `SELECT to_addresses, cc_addresses, date FROM messages
     WHERE account_id = $1 AND rowid > $2 AND rowid <= $3
       AND from_address IS NOT NULL
       AND lower(trim(from_address)) IN (${selfPlaceholders})`,
    [accountId, sinceRowid, maxRowid, ...selfList],
  );

  const mined = new Map<string, MinedContact>();
  for (const row of rows) {
    for (const header of [row.to_addresses, row.cc_addresses]) {
      for (const { email, name } of parseAddressList(header)) {
        if (selfEmails.has(email) || isUnmailableAddress(email)) continue;
        const existing = mined.get(email);
        if (existing) {
          existing.count += 1;
          if (row.date > existing.lastDate) {
            existing.lastDate = row.date;
            if (name) existing.name = name;
          }
        } else {
          mined.set(email, { email, name, count: 1, lastDate: row.date });
        }
      }
    }
  }
  return [...mined.values()];
}

/** Pass B (write half): chunked multi-row upsert of mined recipients. */
async function upsertMinedContacts(tx: Database, contacts: MinedContact[]): Promise<void> {
  if (contacts.length === 0) return;

  for (let i = 0; i < contacts.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + UPSERT_CHUNK_SIZE);
    const values = chunk
      .map((_, idx) => {
        const base = idx * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, unixepoch(), unixepoch())`;
      })
      .join(", ");
    const params = chunk.flatMap((c) => [
      crypto.randomUUID(),
      c.email,
      c.name,
      c.count,
      c.lastDate,
    ]);
    await tx.execute(
      `INSERT INTO contacts (id, email, display_name, frequency, last_contacted_at, created_at, updated_at)
       VALUES ${values}
       ON CONFLICT(email) DO UPDATE SET
         display_name      = COALESCE(contacts.display_name, excluded.display_name),
         frequency         = contacts.frequency + excluded.frequency,
         last_contacted_at = max(COALESCE(contacts.last_contacted_at, 0), excluded.last_contacted_at),
         updated_at        = unixepoch()`,
      params,
    );
  }
}
