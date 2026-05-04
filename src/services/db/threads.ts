import { getDb, withTransaction } from "./connection";

export interface DbThread {
  id: string;
  account_id: string;
  subject: string | null;
  snippet: string | null;
  last_message_at: number | null;
  message_count: number;
  is_read: number;
  is_starred: number;
  is_important: number;
  has_attachments: number;
  is_snoozed: number;
  snooze_until: number | null;
  is_pinned: number;
  is_muted: number;
  from_name: string | null;
  from_address: string | null;
}

export async function getThreadsForAccount(
  accountId: string,
  labelId?: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  if (labelId) {
    return db.select<DbThread[]>(
      `SELECT t.*, m.from_name, m.from_address FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
       WHERE t.account_id = $1 AND tl.label_id = $2
       GROUP BY t.account_id, t.id
       ORDER BY t.is_pinned DESC, t.last_message_at DESC
       LIMIT $3 OFFSET $4`,
      [accountId, labelId, limit, offset],
    );
  }
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address FROM threads t
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tl_ex
         WHERE tl_ex.account_id = t.account_id AND tl_ex.thread_id = t.id
           AND tl_ex.label_id IN ('DRAFT', 'TRASH')
       )
     ORDER BY t.is_pinned DESC, t.last_message_at DESC LIMIT $2 OFFSET $3`,
    [accountId, limit, offset],
  );
}

export async function getThreadIdsForLabel(
  accountId: string,
  labelId: string,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT t.id FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     WHERE t.account_id = $1 AND tl.label_id = $2
     ORDER BY t.last_message_at DESC`,
    [accountId, labelId],
  );
  return rows.map((r) => r.id);
}

export async function getThreadsForCategory(
  accountId: string,
  category: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  if (category === "Primary") {
    // Primary includes threads with NULL category (uncategorized)
    return db.select<DbThread[]>(
      `SELECT t.*, m.from_name, m.from_address FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
       WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND (tc.category IS NULL OR tc.category = 'Primary')
       GROUP BY t.account_id, t.id
       ORDER BY t.is_pinned DESC, t.last_message_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );
  }
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     INNER JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND tc.category = $2
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC, t.last_message_at DESC
     LIMIT $3 OFFSET $4`,
    [accountId, category, limit, offset],
  );
}

export async function upsertThread(thread: {
  id: string;
  accountId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: number | null;
  messageCount: number;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  hasAttachments: boolean;
}): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      `INSERT INTO threads (id, account_id, subject, snippet, last_message_at, message_count, is_read, is_starred, is_important, has_attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT(account_id, id) DO UPDATE SET
         subject = $3, snippet = $4, last_message_at = $5, message_count = $6,
         is_read = $7, is_starred = $8, is_important = $9, has_attachments = $10`,
      [
        thread.id,
        thread.accountId,
        thread.subject,
        thread.snippet,
        thread.lastMessageAt,
        thread.messageCount,
        thread.isRead ? 1 : 0,
        thread.isStarred ? 1 : 0,
        thread.isImportant ? 1 : 0,
        thread.hasAttachments ? 1 : 0,
      ],
    );
  });
}

export async function recalculateThreadStats(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    // 1. Update basic stats
    await db.execute(
      `UPDATE threads
       SET
         is_read = COALESCE((SELECT MIN(is_read) FROM messages WHERE account_id = $1 AND thread_id = $2), 1),
         is_starred = COALESCE((SELECT MAX(is_starred) FROM messages WHERE account_id = $1 AND thread_id = $2), 0),
         has_attachments = CASE WHEN EXISTS(SELECT 1 FROM attachments a JOIN messages m ON a.message_id = m.id WHERE m.account_id = $1 AND m.thread_id = $2) THEN 1 ELSE 0 END,
         message_count = (SELECT COUNT(*) FROM messages WHERE account_id = $1 AND thread_id = $2),
         last_message_at = COALESCE((SELECT MAX(date) FROM messages WHERE account_id = $1 AND thread_id = $2), threads.last_message_at)
       WHERE account_id = $1 AND id = $2`,
      [accountId, threadId],
    );

    // 2. Recalculate labels
    // We look up labels that correspond to the imap_folder of any message in this thread
    const labelRows = await db.select<{ id: string }[]>(
      `SELECT DISTINCT l.id
       FROM messages m
       JOIN labels l ON l.account_id = m.account_id AND l.imap_folder_path = m.imap_folder
       WHERE m.account_id = $1 AND m.thread_id = $2`,
      [accountId, threadId],
    );

    const labels = new Set(labelRows.map((r) => r.id));

    // Add pseudo-labels based on thread state
    const thread = await db.select<{ is_read: number; is_starred: number }[]>(
      "SELECT is_read, is_starred FROM threads WHERE account_id = $1 AND id = $2",
      [accountId, threadId],
    );

    if (thread[0]) {
      if (thread[0].is_read === 0) labels.add("UNREAD");
      if (thread[0].is_starred === 1) labels.add("STARRED");
    }

    // Update thread_labels table
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
      [accountId, threadId],
    );

    for (const labelId of labels) {
      await db.execute(
        "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, $3)",
        [accountId, threadId, labelId],
      );
    }
  });
}

export async function setThreadLabels(
  accountId: string,
  threadId: string,
  labelIds: string[],
): Promise<void> {
  await withTransaction(async (db) => {
    // Remove existing labels
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
      [accountId, threadId],
    );
    // Insert new labels
    for (const labelId of labelIds) {
      await db.execute(
        "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, $3)",
        [accountId, threadId, labelId],
      );
    }
  });
}

export async function getThreadLabelIds(
  accountId: string,
  threadId: string,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ label_id: string }[]>(
    "SELECT label_id FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
    [accountId, threadId],
  );
  return rows.map((r) => r.label_id);
}

export async function getThreadById(
  accountId: string,
  threadId: string,
): Promise<DbThread | undefined> {
  const db = await getDb();
  const rows = await db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address FROM threads t
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE t.account_id = $1 AND t.id = $2
     LIMIT 1`,
    [accountId, threadId],
  );
  return rows[0];
}

export async function getThreadCountForAccount(
  accountId: string,
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM threads WHERE account_id = $1",
    [accountId],
  );
  return rows[0]?.count ?? 0;
}

export async function getUnreadCountsByLabel(
  accountId: string,
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ label_id: string; count: number }[]>(
    `SELECT tl.label_id, COUNT(*) as count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     WHERE t.account_id = $1 AND t.is_read = 0
     GROUP BY tl.label_id`,
    [accountId],
  );
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.label_id] = row.count;
  }
  return result;
}

export async function getUnreadCountsByCategory(
  accountId: string,
): Promise<Record<string, number>> {
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
  const result: Record<string, number> = {};
  for (const row of rows) {
    const cat = row.category ?? "Primary";
    result[cat] = (result[cat] ?? 0) + row.count;
  }
  return result;
}

export async function getUnreadInboxCount(accountId?: string): Promise<number> {
  const db = await getDb();
  const sql = accountId
    ? `SELECT COUNT(*) as count FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       WHERE tl.account_id = $1 AND tl.label_id = 'INBOX' AND t.is_read = 0`
    : `SELECT COUNT(*) as count FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       WHERE tl.label_id = 'INBOX' AND t.is_read = 0`;
  const params = accountId ? [accountId] : [];
  const rows = await db.select<{ count: number }[]>(sql, params);
  return rows[0]?.count ?? 0;
}

export async function deleteThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    // Delete attachments for messages in this thread
    await db.execute(
      `DELETE FROM attachments WHERE account_id = $1 AND message_id IN (
        SELECT id FROM messages WHERE account_id = $1 AND thread_id = $2
      )`,
      [accountId, threadId],
    );
    // Delete messages
    await db.execute(
      "DELETE FROM messages WHERE account_id = $1 AND thread_id = $2",
      [accountId, threadId],
    );
    // Delete thread labels
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
      [accountId, threadId],
    );
    // Delete thread categories
    await db.execute(
      "DELETE FROM thread_categories WHERE account_id = $1 AND thread_id = $2",
      [accountId, threadId],
    );
    // Finally delete the thread itself
    await db.execute("DELETE FROM threads WHERE account_id = $1 AND id = $2", [
      accountId,
      threadId,
    ]);
  });
}

export async function deleteAllThreadsForAccount(
  accountId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute("DELETE FROM threads WHERE account_id = $1", [accountId]);
  });
}

export async function pinThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      "UPDATE threads SET is_pinned = 1 WHERE account_id = $1 AND id = $2",
      [accountId, threadId],
    );
  });
}

export async function unpinThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      "UPDATE threads SET is_pinned = 0 WHERE account_id = $1 AND id = $2",
      [accountId, threadId],
    );
  });
}

export async function muteThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      "UPDATE threads SET is_muted = 1 WHERE account_id = $1 AND id = $2",
      [accountId, threadId],
    );
  });
}

export async function unmuteThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      "UPDATE threads SET is_muted = 0 WHERE account_id = $1 AND id = $2",
      [accountId, threadId],
    );
  });
}

export async function getMutedThreadIds(
  accountId: string,
): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM threads WHERE account_id = $1 AND is_muted = 1",
    [accountId],
  );
  return new Set(rows.map((r) => r.id));
}
