import { getDb } from "./connection";

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

export async function setThreadCategory(
  accountId: string,
  threadId: string,
  category: string,
  isManual = false,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO thread_categories (account_id, thread_id, category, is_manual)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(account_id, thread_id) DO UPDATE SET
       category = $3, is_manual = $4`,
    [accountId, threadId, category, isManual ? 1 : 0],
  );
}

export async function setThreadCategoriesBatch(
  accountId: string,
  categories: Map<string, string>,
): Promise<void> {
  const db = await getDb();
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
