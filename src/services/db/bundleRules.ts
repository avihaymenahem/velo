import { getDb, selectFirstBy, existsBy, boolToInt } from "./connection";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";

export interface DeliverySchedule {
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  hour: number;
  minute: number;
}

export interface DbBundleRule {
  id: string;
  account_id: string;
  category: string;
  is_bundled: number;
  delivery_enabled: number;
  delivery_schedule: string | null;
  last_delivered_at: number | null;
  created_at: number;
}

export interface DbBundledThread {
  account_id: string;
  thread_id: string;
  category: string;
  held_until: number | null;
}

export async function getBundleRules(accountId: string): Promise<DbBundleRule[]> {
  const db = await getDb();
  return db.select<DbBundleRule[]>(
    "SELECT * FROM bundle_rules WHERE account_id = $1",
    [accountId],
  );
}

export async function getBundleRule(
  accountId: string,
  category: string,
): Promise<DbBundleRule | null> {
  return selectFirstBy<DbBundleRule>(
    "SELECT * FROM bundle_rules WHERE account_id = $1 AND category = $2",
    [accountId, category],
  );
}

export async function setBundleRule(
  accountId: string,
  category: string,
  isBundled: boolean,
  deliveryEnabled: boolean,
  schedule: DeliverySchedule | null,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO bundle_rules (id, account_id, category, is_bundled, delivery_enabled, delivery_schedule)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(account_id, category) DO UPDATE SET
       is_bundled = $4, delivery_enabled = $5, delivery_schedule = $6`,
    [id, accountId, category, boolToInt(isBundled), boolToInt(deliveryEnabled), schedule ? JSON.stringify(schedule) : null],
  );
}

export async function holdThread(
  accountId: string,
  threadId: string,
  category: string,
  heldUntil: number | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO bundled_threads (account_id, thread_id, category, held_until)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(account_id, thread_id) DO UPDATE SET
       category = $3, held_until = $4`,
    [accountId, threadId, category, heldUntil],
  );
}

export async function isThreadHeld(
  accountId: string,
  threadId: string,
): Promise<boolean> {
  const now = getCurrentUnixTimestamp();
  return existsBy(
    "SELECT COUNT(*) as count FROM bundled_threads WHERE account_id = $1 AND thread_id = $2 AND held_until > $3",
    [accountId, threadId, now],
  );
}

export async function getHeldThreadIds(
  accountId: string,
): Promise<Set<string>> {
  const db = await getDb();
  const now = getCurrentUnixTimestamp();
  const rows = await db.select<{ thread_id: string }[]>(
    "SELECT thread_id FROM bundled_threads WHERE account_id = $1 AND held_until > $2",
    [accountId, now],
  );
  return new Set(rows.map((r) => r.thread_id));
}

export async function releaseHeldThreads(
  accountId: string,
  category: string,
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM bundled_threads WHERE account_id = $1 AND category = $2 AND held_until IS NOT NULL",
    [accountId, category],
  );
  return result.rowsAffected;
}

export async function updateLastDelivered(
  accountId: string,
  category: string,
): Promise<void> {
  const db = await getDb();
  const now = getCurrentUnixTimestamp();
  await db.execute(
    "UPDATE bundle_rules SET last_delivered_at = $1 WHERE account_id = $2 AND category = $3",
    [now, accountId, category],
  );
}

export async function getBundleSummary(
  accountId: string,
  category: string,
): Promise<{ count: number; latestSubject: string | null; latestSender: string | null }> {
  const db = await getDb();
  // Count threads in this category that are in inbox
  const countRows = await db.select<{ count: number }[]>(
    `SELECT COUNT(DISTINCT t.id) as count
     FROM threads t
     JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'
     JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id AND tc.category = $2
     WHERE t.account_id = $1`,
    [accountId, category],
  );
  const latestRows = await db.select<{ subject: string | null; from_name: string | null }[]>(
    `SELECT t.subject, m.from_name
     FROM threads t
     JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'
     JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id AND tc.category = $2
     JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
     WHERE t.account_id = $1
     ORDER BY t.last_message_at DESC LIMIT 1`,
    [accountId, category],
  );

  return {
    count: countRows[0]?.count ?? 0,
    latestSubject: latestRows[0]?.subject ?? null,
    latestSender: latestRows[0]?.from_name ?? null,
  };
}

/**
 * Batch-fetch bundle summaries for multiple categories in 2 queries instead of 2N.
 */
export async function getBundleSummaries(
  accountId: string,
  categories: string[],
): Promise<Map<string, { count: number; latestSubject: string | null; latestSender: string | null }>> {
  if (categories.length === 0) return new Map();
  const db = await getDb();
  const placeholders = categories.map((_, i) => `$${i + 2}`).join(", ");

  const countRows = await db.select<{ category: string; count: number }[]>(
    `SELECT tc.category, COUNT(DISTINCT t.id) as count
     FROM threads t
     JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'
     JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id AND tc.category IN (${placeholders})
     WHERE t.account_id = $1
     GROUP BY tc.category`,
    [accountId, ...categories],
  );

  const latestRows = await db.select<{ category: string; subject: string | null; from_name: string | null }[]>(
    `SELECT tc.category, t.subject, m.from_name
     FROM threads t
     JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id AND tl.label_id = 'INBOX'
     JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id AND tc.category IN (${placeholders})
     JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
     WHERE t.account_id = $1
     GROUP BY tc.category
     HAVING t.last_message_at = MAX(t.last_message_at)`,
    [accountId, ...categories],
  );

  const latestMap = new Map(latestRows.map((r) => [r.category, r]));
  const result = new Map<string, { count: number; latestSubject: string | null; latestSender: string | null }>();
  for (const cat of categories) {
    const countRow = countRows.find((r) => r.category === cat);
    const latest = latestMap.get(cat);
    result.set(cat, {
      count: countRow?.count ?? 0,
      latestSubject: latest?.subject ?? null,
      latestSender: latest?.from_name ?? null,
    });
  }
  return result;
}

/**
 * Calculate the next delivery time for a schedule from now.
 */
export function getNextDeliveryTime(schedule: DeliverySchedule): number {
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = schedule.hour * 60 + schedule.minute;

  // Find the next matching day
  for (let offset = 0; offset < 7; offset++) {
    const day = (currentDay + offset) % 7;
    if (schedule.days.includes(day)) {
      // If today and target time hasn't passed, use today
      if (offset === 0 && currentMinutes < targetMinutes) {
        const target = new Date(now);
        target.setHours(schedule.hour, schedule.minute, 0, 0);
        return Math.floor(target.getTime() / 1000);
      }
      // Otherwise use next occurrence
      if (offset > 0) {
        const target = new Date(now);
        target.setDate(target.getDate() + offset);
        target.setHours(schedule.hour, schedule.minute, 0, 0);
        return Math.floor(target.getTime() / 1000);
      }
    }
  }

  // Fallback: next week same day
  const target = new Date(now);
  target.setDate(target.getDate() + 7);
  target.setHours(schedule.hour, schedule.minute, 0, 0);
  return Math.floor(target.getTime() / 1000);
}
