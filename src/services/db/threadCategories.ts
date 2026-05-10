import { getDb, withTransaction } from "./connection";

export type ThreadCategory = "Primary" | "Updates" | "Promotions" | "Social" | "Newsletters";

export const ALL_CATEGORIES: ThreadCategory[] = [
  "Primary",
  "Updates",
  "Promotions",
  "Social",
  "Newsletters",
];

interface DbThreadCategory {
  account_id: string;
  thread_id: string;
  category: string;
  is_manual: number;
}

export async function getThreadCategory(
  accountId: string,
  threadId: string,
): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<DbThreadCategory[]>(
    "SELECT category FROM thread_categories WHERE account_id = $1 AND thread_id = $2",
    [accountId, threadId],
  );
  return rows[0]?.category ?? null;
}

export async function getThreadCategoryWithManual(
  accountId: string,
  threadId: string,
): Promise<{ category: string; isManual: boolean } | null> {
  const db = await getDb();
  const rows = await db.select<DbThreadCategory[]>(
    "SELECT category, is_manual FROM thread_categories WHERE account_id = $1 AND thread_id = $2",
    [accountId, threadId],
  );
  if (!rows[0]) return null;
  return { category: rows[0].category, isManual: rows[0].is_manual === 1 };
}

export async function getRecentRuleCategorizedThreadIds(
  accountId: string,
  limit = 20,
): Promise<{ id: string; subject: string; snippet: string; fromAddress: string }[]> {
  const db = await getDb();
  return db.select(
    `SELECT t.id, t.subject, t.snippet, m.from_address as fromAddress
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     INNER JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND tc.is_manual = 0
     ORDER BY t.last_message_at DESC
     LIMIT $2`,
    [accountId, limit],
  );
}

export async function getCategoriesForThreads(
  accountId: string,
  threadIds: string[],
): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const db = await getDb();
  // Query in batches to avoid too many params
  const map = new Map<string, string>();
  const batchSize = 100;
  for (let i = 0; i < threadIds.length; i += batchSize) {
    const batch = threadIds.slice(i, i + batchSize);
    const placeholders = batch.map((_, idx) => `$${idx + 2}`).join(",");
    const rows = await db.select<DbThreadCategory[]>(
      `SELECT thread_id, category FROM thread_categories WHERE account_id = $1 AND thread_id IN (${placeholders})`,
      [accountId, ...batch],
    );
    for (const row of rows) {
      map.set(row.thread_id, row.category);
    }
  }
  return map;
}

const NON_PRIMARY_CATEGORIES = new Set(["Updates", "Promotions", "Social", "Newsletters"]);

export async function setThreadCategory(
  accountId: string,
  threadId: string,
  category: string,
  isManual = false,
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      `INSERT INTO thread_categories (account_id, thread_id, category, is_manual)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(account_id, thread_id) DO UPDATE SET
         category = $3, is_manual = $4`,
      [accountId, threadId, category, isManual ? 1 : 0],
    );
    // Urgency is only meaningful for Primary. If a thread (typically IMAP, where
    // category is determined after sync) ends up non-Primary, clear any auto-scored
    // urgency so it doesn't show badges in non-Primary views.
    if (!isManual && NON_PRIMARY_CATEGORIES.has(category)) {
      await db.execute(
        `UPDATE threads SET urgency_score = 0, is_heat_extinguished = 0
         WHERE account_id = $1 AND id = $2
           AND (manual_urgency_override IS NULL OR manual_urgency_override = 0)`,
        [accountId, threadId],
      );
    }
  });
}

export async function setThreadCategoriesBatch(
  accountId: string,
  categories: Map<string, string>,
): Promise<void> {
  await withTransaction(async (db) => {
    for (const [threadId, category] of categories) {
      // Respect manual overrides — don't overwrite if is_manual = 1
      await db.execute(
        `INSERT INTO thread_categories (account_id, thread_id, category, is_manual)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT(account_id, thread_id) DO UPDATE SET
           category = $3
         WHERE is_manual = 0`,
        [accountId, threadId, category],
      );
    }
  });
}

export async function getCategoryUnreadCounts(
  accountId: string,
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ category: string | null; count: number }[]>(
    `SELECT tc.category, COUNT(*) as count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND t.is_read = 0
     GROUP BY tc.category`,
    [accountId],
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    const cat = row.category ?? "Primary";
    map.set(cat, (map.get(cat) ?? 0) + row.count);
  }
  return map;
}

export async function getUncategorizedInboxThreadIds(
  accountId: string,
  limit = 20,
): Promise<{ id: string; subject: string; snippet: string; fromAddress: string }[]> {
  const db = await getDb();
  return db.select(
    `SELECT t.id, t.subject, t.snippet, m.from_address as fromAddress
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND tc.thread_id IS NULL
     ORDER BY t.last_message_at DESC
     LIMIT $2`,
    [accountId, limit],
  );
}
