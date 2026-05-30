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
  all_recipients: string | null;
  all_senders: string | null;
  unread_count: number;
  urgency_score: number | null;
  sentiment_score: number | null;
  manual_urgency_override: number | null;
  is_heat_extinguished: number | null;
}

export async function getThreadsForAccount(
  accountId: string,
  labelId?: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  if (labelId) {
    // For the Trash view every message is is_trashed=1, so the usual
    // `AND m2.is_trashed = 0` JOIN condition returns NULL for from_name/from_address.
    // Use a separate query without that filter so sender data is still available.
    const isTrash = labelId === "TRASH";
    const latestMsgCondition = isTrash
      ? `SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id`
      : `SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0`;
    return db.select<DbThread[]>(
      `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
         (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
         (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
       FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (${latestMsgCondition})
       WHERE t.account_id = $1 AND tl.label_id = $2
       GROUP BY t.account_id, t.id
       ORDER BY t.is_pinned DESC, t.last_message_at DESC
       LIMIT $3 OFFSET $4`,
      [accountId, labelId, limit, offset],
    );
  }
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
       (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
       (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
     FROM threads t
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0)
     WHERE t.account_id = $1
       AND NOT (
         EXISTS (SELECT 1 FROM thread_labels tl_ex WHERE tl_ex.account_id = t.account_id AND tl_ex.thread_id = t.id AND tl_ex.label_id IN ('DRAFT', 'TRASH'))
         AND NOT EXISTS (SELECT 1 FROM thread_labels tl_ib WHERE tl_ib.account_id = t.account_id AND tl_ib.thread_id = t.id AND tl_ib.label_id = 'INBOX')
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
      `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
         (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
         (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
       FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0)
       WHERE t.account_id = $1 AND tl.label_id = 'INBOX' AND (tc.category IS NULL OR tc.category = 'Primary')
       GROUP BY t.account_id, t.id
       ORDER BY t.is_pinned DESC, t.last_message_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset],
    );
  }
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
       (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
       (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     INNER JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0)
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

/**
 * Returns a map of normalizedSubject → threadId for all existing threads of the account.
 * Used by delta sync to merge forwarded/replied messages into existing threads when
 * In-Reply-To/References headers are absent.
 */
export async function getThreadSubjectMap(accountId: string): Promise<Map<string, string>> {
  const { normalizeSubject } = await import('../threading/threadBuilder');
  const db = await getDb();
  const rows = await db.select<{ id: string; subject: string }[]>(
    `SELECT id, subject FROM threads WHERE account_id = $1 AND subject IS NOT NULL AND subject != ''`,
    [accountId],
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    const norm = normalizeSubject(row.subject);
    if (norm && !map.has(norm)) {
      map.set(norm, row.id);
    }
  }
  return map;
}

export async function markThreadUnreadInDb(
  accountId: string,
  threadId: string,
  specificMessageIds?: string[],
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE threads SET is_read = 0 WHERE account_id = $1 AND id = $2 AND is_read = 1",
    [accountId, threadId],
  );
  // Keep messages table consistent so message-level queries (smart folder) agree
  // with the thread-level state. Prefer marking the specific confirmed-unread message
  // IDs (from the Gmail History API); fall back to the latest message by date.
  if (specificMessageIds && specificMessageIds.length > 0) {
    const ph = specificMessageIds.map((_, i) => `$${i + 3}`).join(",");
    await db.execute(
      `UPDATE messages SET is_read = 0 WHERE account_id = $1 AND thread_id = $2 AND id IN (${ph})`,
      [accountId, threadId, ...specificMessageIds],
    );
  } else {
    await db.execute(
      `UPDATE messages SET is_read = 0
       WHERE account_id = $1 AND id = (
         SELECT id FROM messages
         WHERE account_id = $1 AND thread_id = $2
         ORDER BY date DESC LIMIT 1
       )`,
      [accountId, threadId],
    );
  }
}

export async function recalculateThreadStats(
  accountId: string,
  threadId: string,
): Promise<void> {
  await withTransaction(async (db) => {
    // 1. Update basic stats — exclude trashed messages from counts and last date
    await db.execute(
      `UPDATE threads
       SET
         is_read = COALESCE((SELECT MIN(is_read) FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_draft = 0 AND is_trashed = 0), 1),
         is_starred = COALESCE((SELECT MAX(is_starred) FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_trashed = 0), 0),
         has_attachments = CASE WHEN EXISTS(SELECT 1 FROM attachments a JOIN messages m ON a.message_id = m.id WHERE m.account_id = $1 AND m.thread_id = $2 AND m.is_trashed = 0 AND a.is_inline = 0 AND a.content_id IS NULL) THEN 1 ELSE 0 END,
         message_count = (SELECT COUNT(*) FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_draft = 0 AND is_trashed = 0),
         last_message_at = COALESCE((SELECT MAX(date) FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_trashed = 0), threads.last_message_at)
       WHERE account_id = $1 AND id = $2`,
      [accountId, threadId],
    );

    // 2. Recalculate labels from all messages (including trashed ones — they contribute TRASH label).
    // Gmail: union all gmail_label_ids JSON arrays per message.
    // IMAP: derive labels from imap_folder_path mapping.
    const gmailLabelRows = await db.select<{ gmail_label_ids: string }[]>(
      `SELECT gmail_label_ids FROM messages WHERE account_id = $1 AND thread_id = $2 AND gmail_label_ids IS NOT NULL`,
      [accountId, threadId],
    );

    if (gmailLabelRows.length > 0) {
      // Gmail account: rebuild thread_labels from per-message gmail_label_ids
      const labels = new Set<string>();
      for (const row of gmailLabelRows) {
        try {
          const ids = JSON.parse(row.gmail_label_ids) as string[];
          for (const id of ids) labels.add(id);
        } catch {
          // ignore malformed JSON
        }
      }
      const thread = await db.select<{ is_read: number; is_starred: number }[]>(
        "SELECT is_read, is_starred FROM threads WHERE account_id = $1 AND id = $2",
        [accountId, threadId],
      );
      if (thread[0]) {
        if (thread[0].is_read === 0) labels.add("UNREAD");
        if (thread[0].is_starred === 1) labels.add("STARRED");
      }
      await db.execute("DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2", [accountId, threadId]);
      for (const labelId of labels) {
        await db.execute(
          "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, $3)",
          [accountId, threadId, labelId],
        );
      }
    } else {
      // IMAP account: derive labels from imap_folder_path mapping
      const imapLabelRows = await db.select<{ id: string }[]>(
        `SELECT DISTINCT l.id
         FROM messages m
         JOIN labels l ON l.account_id = m.account_id AND l.imap_folder_path = m.imap_folder
         WHERE m.account_id = $1 AND m.thread_id = $2`,
        [accountId, threadId],
      );
      if (imapLabelRows.length > 0) {
        const labels = new Set(imapLabelRows.map((r) => r.id));
        const thread = await db.select<{ is_read: number; is_starred: number }[]>(
          "SELECT is_read, is_starred FROM threads WHERE account_id = $1 AND id = $2",
          [accountId, threadId],
        );
        if (thread[0]) {
          if (thread[0].is_read === 0) labels.add("UNREAD");
          if (thread[0].is_starred === 1) labels.add("STARRED");
        }
        await db.execute("DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2", [accountId, threadId]);
        for (const labelId of labels) {
          await db.execute(
            "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, $3)",
            [accountId, threadId, labelId],
          );
        }
      }
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

export async function getThreadsByIds(
  pairs: Array<{ accountId: string; threadId: string }>,
): Promise<DbThread[]> {
  if (pairs.length === 0) return [];
  const db = await getDb();
  const results: DbThread[] = [];
  // Fetch in batches to avoid very long IN clauses
  for (const { accountId, threadId } of pairs) {
    const rows = await db.select<DbThread[]>(
      `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
         (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
         (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
       FROM threads t
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0)
       WHERE t.account_id = $1 AND t.id = $2
       LIMIT 1`,
      [accountId, threadId],
    );
    if (rows[0]) results.push(rows[0]);
  }
  return results;
}

/**
 * Batched variant of getThreadsByIds. Groups pairs by accountId and runs one
 * query per account with `id IN (...)`. Used by search to avoid the
 * one-query-per-thread cost of the loop-based version above.
 */
export async function getThreadsByIdsBatch(
  pairs: Array<{ accountId: string; threadId: string }>,
): Promise<DbThread[]> {
  if (pairs.length === 0) return [];
  const db = await getDb();

  const byAccount = new Map<string, string[]>();
  for (const { accountId, threadId } of pairs) {
    const list = byAccount.get(accountId);
    if (list) list.push(threadId);
    else byAccount.set(accountId, [threadId]);
  }

  const results: DbThread[] = [];
  for (const [accountId, threadIds] of byAccount) {
    // $1 is accountId, $2..$N are threadIds
    const placeholders = threadIds.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await db.select<DbThread[]>(
      `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
         (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
         (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
       FROM threads t
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0)
       WHERE t.account_id = $1 AND t.id IN (${placeholders})`,
      [accountId, ...threadIds],
    );
    results.push(...rows);
  }
  return results;
}

/**
 * Batched fetch of label IDs for a set of (accountId, threadId) pairs.
 * Returns a Map keyed by `${accountId}:${threadId}` to the label ID list.
 * One query per account.
 */
export async function getThreadLabelsByIdsBatch(
  pairs: Array<{ accountId: string; threadId: string }>,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (pairs.length === 0) return out;
  const db = await getDb();

  const byAccount = new Map<string, string[]>();
  for (const { accountId, threadId } of pairs) {
    const list = byAccount.get(accountId);
    if (list) list.push(threadId);
    else byAccount.set(accountId, [threadId]);
  }

  for (const [accountId, threadIds] of byAccount) {
    const placeholders = threadIds.map((_, i) => `$${i + 2}`).join(", ");
    const rows = await db.select<Array<{ thread_id: string; label_id: string }>>(
      `SELECT thread_id, label_id FROM thread_labels
       WHERE account_id = $1 AND thread_id IN (${placeholders})`,
      [accountId, ...threadIds],
    );
    for (const r of rows) {
      const key = `${accountId}:${r.thread_id}`;
      const list = out.get(key);
      if (list) list.push(r.label_id);
      else out.set(key, [r.label_id]);
    }
  }
  return out;
}

export async function getThreadById(
  accountId: string,
  threadId: string,
): Promise<DbThread | undefined> {
  const db = await getDb();
  const rows = await db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
       (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
       (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
     FROM threads t
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id AND m2.is_trashed = 0)
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
       AND NOT (
         EXISTS (SELECT 1 FROM thread_labels tl_d WHERE tl_d.account_id = t.account_id AND tl_d.thread_id = t.id AND tl_d.label_id = 'DRAFT')
         AND NOT EXISTS (SELECT 1 FROM thread_labels tl_i WHERE tl_i.account_id = t.account_id AND tl_i.thread_id = t.id AND tl_i.label_id = 'INBOX')
       )
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
  const count = rows[0]?.count ?? 0;

  // Debug: log the raw unread threads so we can diagnose "zombie" emails missing from badge
  if (import.meta.env.DEV || (globalThis as Record<string, unknown>)["__veloDebugBadge"]) {
    const debugRows = await db.select<{ id: string; subject: string | null; is_read: number; labels: string }[]>(
      `SELECT t.id, t.subject, t.is_read, GROUP_CONCAT(tl2.label_id) as labels
       FROM threads t
       INNER JOIN thread_labels tl2 ON tl2.account_id = t.account_id AND tl2.thread_id = t.id
       WHERE t.is_read = 0
       GROUP BY t.id
       ORDER BY t.last_message_at DESC
       LIMIT 20`,
      [],
    );
    console.log(`[badge] getUnreadInboxCount=${count} | all unread threads (max 20):`, debugRows);
  }

  return count;
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
    // Delete embeddings for messages in this thread
    await db.execute(
      `DELETE FROM message_embeddings WHERE account_id = $1 AND message_id IN (
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
      "UPDATE threads SET is_muted = 1, urgency_score = 0.05 WHERE account_id = $1 AND id = $2",
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

export async function setThreadUrgency(
  accountId: string,
  threadId: string,
  urgencyScore: number,
  sentimentScore?: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE threads SET urgency_score = $1${sentimentScore !== undefined ? ", sentiment_score = $4" : ""}
     WHERE account_id = $2 AND id = $3`,
    sentimentScore !== undefined
      ? [urgencyScore, accountId, threadId, sentimentScore]
      : [urgencyScore, accountId, threadId],
  );
}

export async function setHeatExtinguished(
  accountId: string,
  threadId: string,
  extinguished: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE threads SET is_heat_extinguished = $1 WHERE account_id = $2 AND id = $3",
    [extinguished ? 1 : 0, accountId, threadId],
  );
}

export async function setManualUrgencyOverride(
  accountId: string,
  threadId: string,
  override: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE threads SET manual_urgency_override = $1, urgency_score = 0 WHERE account_id = $2 AND id = $3",
    [override, accountId, threadId],
  );
}

export async function getUnifiedInboxThreads(
  accountIds: string[],
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  if (accountIds.length === 0) return [];
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
  const limitParam = `$${accountIds.length + 1}`;
  const offsetParam = `$${accountIds.length + 2}`;
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
       (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
       (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
       AND m.id = (
         SELECT id FROM messages
         WHERE thread_id = t.id AND account_id = t.account_id AND is_trashed = 0
         ORDER BY date DESC LIMIT 1
       )
     WHERE t.account_id IN (${placeholders})
       AND tl.label_id = 'INBOX'
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC, t.last_message_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...accountIds, limit, offset],
  );
}

export async function getUnifiedFolderThreads(
  accountIds: string[],
  labelId: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  if (accountIds.length === 0) return [];
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");

  if (!labelId) {
    // "All Mail" — no label filter, exclude trash and drafts
    const limitParam = `$${accountIds.length + 1}`;
    const offsetParam = `$${accountIds.length + 2}`;
    return db.select<DbThread[]>(
      `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
         (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
         (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
       FROM threads t
       LEFT JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
         AND m.id = (
           SELECT id FROM messages
           WHERE thread_id = t.id AND account_id = t.account_id
           ORDER BY date DESC LIMIT 1
         )
       WHERE t.account_id IN (${placeholders})
         AND NOT (
           EXISTS (SELECT 1 FROM thread_labels tl_ex WHERE tl_ex.account_id = t.account_id AND tl_ex.thread_id = t.id AND tl_ex.label_id IN ('DRAFT', 'TRASH'))
           AND NOT EXISTS (SELECT 1 FROM thread_labels tl_ib WHERE tl_ib.account_id = t.account_id AND tl_ib.thread_id = t.id AND tl_ib.label_id = 'INBOX')
         )
       ORDER BY t.is_pinned DESC, t.last_message_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      [...accountIds, limit, offset],
    );
  }

  const labelParam = `$${accountIds.length + 1}`;
  const limitParam = `$${accountIds.length + 2}`;
  const offsetParam = `$${accountIds.length + 3}`;
  // For Trash, every message is is_trashed=1 so the usual filter would return NULL
  // for from_name/from_address. Drop the filter so sender data remains accessible.
  const trashedFilter = labelId === "TRASH" ? "" : "AND is_trashed = 0";
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address,
         (SELECT to_addresses FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND LOWER(from_address) = LOWER((SELECT email FROM accounts WHERE id = t.account_id)) AND to_addresses IS NOT NULL AND to_addresses != '' ORDER BY date DESC LIMIT 1) as all_recipients,
       (SELECT GROUP_CONCAT(display, ', ') FROM (SELECT CASE WHEN from_name IS NOT NULL AND from_name != '' THEN from_name || ' <' || from_address || '>' ELSE from_address END as display, MAX(date) as last_date FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND from_address IS NOT NULL AND LOWER(from_address) != LOWER((SELECT email FROM accounts WHERE id = t.account_id)) GROUP BY LOWER(from_address) ORDER BY last_date DESC)) as all_senders,
       (SELECT COUNT(*) FROM messages WHERE account_id = t.account_id AND thread_id = t.id AND is_read = 0 AND is_draft = 0 AND is_trashed = 0) as unread_count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     LEFT JOIN messages m ON m.thread_id = t.id AND m.account_id = t.account_id
       AND m.id = (
         SELECT id FROM messages
         WHERE thread_id = t.id AND account_id = t.account_id ${trashedFilter}
         ORDER BY date DESC LIMIT 1
       )
     WHERE t.account_id IN (${placeholders})
       AND tl.label_id = ${labelParam}
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC, t.last_message_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...accountIds, labelId, limit, offset],
  );
}

/**
 * Count drafts per account for the sidebar "Drafts" badge.
 * Unlike unread counts, this counts ALL draft threads (read or not) — a draft you
 * authored is always marked read, so an unread-based count would always be 0.
 * Mirrors the Drafts folder list (getThreadsByLabel(accountId, "DRAFT")): every
 * thread carrying the DRAFT label, excluding those moved to Trash.
 */
export async function getDraftCountsByAccounts(
  accountIds: string[],
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (accountIds.length === 0) return result;
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ account_id: string; count: number }[]>(
    `SELECT tl.account_id, COUNT(DISTINCT t.id) AS count
     FROM threads t
     INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
     WHERE tl.account_id IN (${placeholders}) AND tl.label_id = 'DRAFT'
       AND NOT EXISTS (
         SELECT 1 FROM thread_labels tr
         WHERE tr.account_id = t.account_id AND tr.thread_id = t.id AND tr.label_id = 'TRASH'
       )
     GROUP BY tl.account_id`,
    accountIds,
  );
  for (const row of rows) {
    result[row.account_id] = row.count;
  }
  return result;
}

export async function getGlobalUnreadCounts(
  accountIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (accountIds.length === 0) return result;
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
  type Row = { account_id: string; label_id: string; unread_count: number };
  const rows = await db.select<Row[]>(
    `SELECT tl.account_id, tl.label_id, COUNT(*) AS unread_count
     FROM thread_labels tl
     INNER JOIN threads t ON t.id = tl.thread_id AND t.account_id = tl.account_id
     WHERE tl.account_id IN (${placeholders})
       AND t.is_read = 0
       AND EXISTS (
         SELECT 1 FROM thread_labels inbox
         WHERE inbox.thread_id = tl.thread_id
           AND inbox.account_id = tl.account_id
           AND inbox.label_id = 'INBOX'
       )
     GROUP BY tl.account_id, tl.label_id`,
    accountIds,
  );
  for (const row of rows) {
    let byLabel = result.get(row.account_id);
    if (!byLabel) {
      byLabel = new Map();
      result.set(row.account_id, byLabel);
    }
    byLabel.set(row.label_id, row.unread_count);
  }
  return result;
}
