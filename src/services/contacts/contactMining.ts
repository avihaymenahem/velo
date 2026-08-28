import { getDb, withTransaction } from "@/services/db/connection";
import { getSetting, setSetting } from "@/services/db/settings";
import { getAllAccounts } from "@/services/db/accounts";
import { getAliasesForAccount } from "@/services/db/sendAsAliases";
import { parseAddressList } from "@/utils/addressList";
import { isUnmailableAddress, UNMAILABLE_PREFIXES } from "@/utils/noReply";
import { normalizeEmail } from "@/utils/emailUtils";

const WATERMARK_KEY_PREFIX = "contacts_mined_rowid:";

/** Multi-row upsert chunk size: 4 params per row, safely under SQLite's 999 limit. */
const UPSERT_CHUNK_SIZE = 100;

interface MinedContact {
  email: string;
  name: string | null;
  count: number;
  lastDate: number;
}

/**
 * Mine the contacts table from synced messages for one account.
 *
 * Incremental via a per-account rowid watermark (rowid is monotonic on insert,
 * so back-dated messages pulled in by a folder backfill are still picked up —
 * a date watermark would skip them). Runs in the background off the render
 * path; safe to re-run at any time.
 *
 * Returns the number of source messages scanned.
 */
export async function mineContactsForAccount(accountId: string): Promise<number> {
  const db = await getDb();
  const watermarkKey = `${WATERMARK_KEY_PREFIX}${accountId}`;
  const sinceRowid = parseInt((await getSetting(watermarkKey)) ?? "0", 10) || 0;

  // Capture the upper bound before mining so rows inserted by a concurrent
  // sync are never skipped — they'll be picked up by the next run.
  const maxRows = await db.select<Array<{ max_rowid: number | null; cnt: number }>>(
    "SELECT MAX(rowid) AS max_rowid, COUNT(*) AS cnt FROM messages WHERE account_id = $1 AND rowid > $2",
    [accountId, sinceRowid],
  );
  const maxRowid = maxRows[0]?.max_rowid;
  const scanned = maxRows[0]?.cnt ?? 0;
  if (!maxRowid || scanned === 0) return 0;

  const selfEmails = await getSelfEmails(accountId);

  await mineSenders(accountId, sinceRowid, maxRowid, selfEmails);
  await mineSentRecipients(accountId, sinceRowid, maxRowid, selfEmails);

  // Only advance the watermark once both passes succeed. If this write fails,
  // the next run re-mines the same window and double-counts frequency there —
  // harmless (frequency only affects suggestion ordering).
  await setSetting(watermarkKey, String(maxRowid));
  return scanned;
}

/** Mine contacts for every account. Intended to be fire-and-forget. */
export async function mineContactsForAllAccounts(): Promise<void> {
  const accounts = await getAllAccounts();
  for (const account of accounts) {
    if (account.provider === "caldav") continue;
    try {
      await mineContactsForAccount(account.id);
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
 * Pass A: aggregate senders of received mail in a single SQL statement.
 */
async function mineSenders(
  accountId: string,
  sinceRowid: number,
  maxRowid: number,
  selfEmails: Set<string>,
): Promise<void> {
  const db = await getDb();

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
  await db.execute(
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
 * Pass B: mine To/Cc recipients of mail the user sent (highest-value contacts).
 * Headers are raw RFC-5322 address lists, so parsing happens in JS.
 */
async function mineSentRecipients(
  accountId: string,
  sinceRowid: number,
  maxRowid: number,
  selfEmails: Set<string>,
): Promise<void> {
  const db = await getDb();
  if (selfEmails.size === 0) return;

  const selfList = [...selfEmails];
  const selfPlaceholders = selfList.map((_, i) => `$${i + 4}`).join(", ");
  const rows = await db.select<Array<{ to_addresses: string | null; cc_addresses: string | null; date: number }>>(
    `SELECT to_addresses, cc_addresses, date FROM messages
     WHERE account_id = $1 AND rowid > $2 AND rowid <= $3
       AND from_address IS NOT NULL
       AND lower(trim(from_address)) IN (${selfPlaceholders})`,
    [accountId, sinceRowid, maxRowid, ...selfList],
  );
  if (rows.length === 0) return;

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
  if (mined.size === 0) return;

  const contacts = [...mined.values()];
  await withTransaction(async (tx) => {
    for (let i = 0; i < contacts.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + UPSERT_CHUNK_SIZE);
      const values = chunk
        .map((_, idx) => {
          const base = idx * 4;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, unixepoch(), unixepoch())`;
        })
        .join(", ");
      const params = chunk.flatMap((c) => [
        crypto.randomUUID(),
        c.email,
        c.name,
        c.count,
      ]);
      await tx.execute(
        `INSERT INTO contacts (id, email, display_name, frequency, created_at, updated_at)
         VALUES ${values}
         ON CONFLICT(email) DO UPDATE SET
           display_name = COALESCE(contacts.display_name, excluded.display_name),
           frequency    = contacts.frequency + excluded.frequency,
           updated_at   = unixepoch()`,
        params,
      );
    }
    // Bump last_contacted_at separately — the VALUES upsert can't express a
    // per-row max() against the existing column without another param per row.
    for (const c of contacts) {
      await tx.execute(
        `UPDATE contacts SET last_contacted_at = max(COALESCE(last_contacted_at, 0), $1) WHERE email = $2`,
        [c.lastDate, c.email],
      );
    }
  });
}
