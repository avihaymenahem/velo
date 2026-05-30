import { getDb, withTransaction } from "./connection";

export interface DbMessage {
  id: string;
  account_id: string;
  thread_id: string;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  reply_to: string | null;
  subject: string | null;
  snippet: string | null;
  date: number;
  is_read: number;
  is_starred: number;
  body_html: string | null;
  body_text: string | null;
  body_cached: number;
  raw_size: number | null;
  internal_date: number | null;
  list_unsubscribe: string | null;
  list_unsubscribe_post: string | null;
  auth_results: string | null;
  message_id_header: string | null;
  references_header: string | null;
  in_reply_to_header: string | null;
  imap_uid: number | null;
  imap_folder: string | null;
  is_draft: number;
  has_attachments: number;
}

export async function getMessagesForThread(
  accountId: string,
  threadId: string,
  includeTrashed = false,
): Promise<DbMessage[]> {
  const db = await getDb();
  const trashedFilter = includeTrashed ? "" : "AND m.is_trashed = 0";
  return db.select<DbMessage[]>(
    `SELECT m.*,
       (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM attachments WHERE message_id = m.id AND is_inline = 0) AS has_attachments
     FROM messages m WHERE m.account_id = $1 AND m.thread_id = $2 AND m.is_draft = 0 ${trashedFilter} ORDER BY m.date ASC`,
    [accountId, threadId],
  );
}

// Loads messages without body_html/body_text to reduce memory — bodies are fetched lazily on expand.
// Mirrors Thunderbird's msgHdr vs body separation pattern.
export async function getMessagesMetaForThread(
  accountId: string,
  threadId: string,
): Promise<DbMessage[]> {
  const db = await getDb();
  const rows = await db.select<Omit<DbMessage, "body_html" | "body_text">[]>(
    `SELECT m.id, m.account_id, m.thread_id, m.from_address, m.from_name, m.to_addresses,
     m.cc_addresses, m.bcc_addresses, m.reply_to, m.subject, m.snippet, m.date, m.is_read,
     m.is_starred, m.body_cached, m.raw_size, m.internal_date, m.list_unsubscribe,
     m.list_unsubscribe_post, m.auth_results, m.message_id_header, m.references_header,
     m.in_reply_to_header, m.imap_uid, m.imap_folder,
     (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM attachments WHERE message_id = m.id AND is_inline = 0) AS has_attachments
     FROM messages m WHERE m.account_id = $1 AND m.thread_id = $2 AND m.is_draft = 0 AND m.is_trashed = 0 ORDER BY m.date ASC`,
    [accountId, threadId],
  );
  return rows.map((r) => ({ ...r, body_html: null, body_text: null, is_draft: 0 }));
}

/**
 * Fetch metadata for a specific list of message IDs.
 * Used during the threading phase to avoid keeping all metadata in RAM.
 */
export async function getMessagesByIds(
  accountId: string,
  messageIds: string[],
): Promise<DbMessage[]> {
  const db = await getDb();
  // SQLite variable limit is 999
  const results: DbMessage[] = [];
  for (let i = 0; i < messageIds.length; i += 500) {
    const chunk = messageIds.slice(i, i + 500);
    const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(", ");
    const rows = await db.select<Omit<DbMessage, "body_html" | "body_text">[]>(
      `SELECT m.id, m.account_id, m.thread_id, m.from_address, m.from_name, m.to_addresses,
       m.cc_addresses, m.bcc_addresses, m.reply_to, m.subject, m.snippet, m.date, m.is_read,
       m.is_starred, m.body_cached, m.raw_size, m.internal_date, m.list_unsubscribe,
       m.list_unsubscribe_post, m.auth_results, m.message_id_header, m.references_header,
       m.in_reply_to_header, m.imap_uid, m.imap_folder,
       (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM attachments WHERE message_id = m.id AND is_inline = 0) AS has_attachments
       FROM messages m WHERE m.account_id = $1 AND m.id IN (${placeholders})`,
      [accountId, ...chunk],
    );
    results.push(...rows.map((r) => ({ ...r, body_html: null, body_text: null })));
  }
  return results;
}

export async function getMessageBody(
  accountId: string,
  messageId: string,
): Promise<{ body_html: string | null; body_text: string | null }> {
  const db = await getDb();
  const row = await db.select<{ body_html: string | null; body_text: string | null }[]>(
    "SELECT body_html, body_text FROM messages WHERE account_id = $1 AND id = $2",
    [accountId, messageId],
  );
  return row[0] ?? { body_html: null, body_text: null };
}

/**
 * Check which of the given RFC Message-IDs already exist in the database.
 * Returns a Set of IDs that are already present.
 */
export async function getExistingRfcIds(
  accountId: string,
  rfcIds: string[],
): Promise<Set<string>> {
  if (rfcIds.length === 0) return new Set();
  const db = await getDb();
  const results = new Set<string>();
  for (let i = 0; i < rfcIds.length; i += 500) {
    const chunk = rfcIds.slice(i, i + 500);
    const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(", ");
    const rows = await db.select<{ message_id_header: string }[]>(
      `SELECT message_id_header FROM messages WHERE account_id = $1 AND message_id_header IN (${placeholders})`,
      [accountId, ...chunk],
    );
    for (const row of rows) {
      if (row.message_id_header) results.add(row.message_id_header);
    }
  }
  return results;
}

export async function upsertMessage(msg: {
  id: string;
  accountId: string;
  threadId: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string | null;
  ccAddresses: string | null;
  bccAddresses: string | null;
  replyTo: string | null;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  isStarred: boolean;
  bodyHtml: string | null;
  bodyText: string | null;
  rawSize: number | null;
  internalDate: number | null;
  listUnsubscribe?: string | null;
  listUnsubscribePost?: string | null;
  authResults?: string | null;
  messageIdHeader?: string | null;
  referencesHeader?: string | null;
  inReplyToHeader?: string | null;
  imapUid?: number | null;
  imapFolder?: string | null;
  isDraft?: boolean;
}): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      `INSERT INTO messages (id, account_id, thread_id, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, reply_to, subject, snippet, date, is_read, is_starred, body_html, body_text, body_cached, raw_size, internal_date, list_unsubscribe, list_unsubscribe_post, auth_results, message_id_header, references_header, in_reply_to_header, imap_uid, imap_folder, is_draft)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
       ON CONFLICT(account_id, id) DO UPDATE SET
         from_address = $4, from_name = $5, to_addresses = $6, cc_addresses = $7,
         bcc_addresses = $8, reply_to = $9, subject = $10, snippet = $11,
         date = $12, is_read = $13, is_starred = $14,
         body_html = COALESCE($15, body_html), body_text = COALESCE($16, body_text),
         body_cached = CASE WHEN $15 IS NOT NULL THEN 1 ELSE body_cached END,
         raw_size = $18, internal_date = $19, list_unsubscribe = $20, list_unsubscribe_post = $21,
         auth_results = $22, message_id_header = COALESCE($23, message_id_header),
         references_header = COALESCE($24, references_header),
         in_reply_to_header = COALESCE($25, in_reply_to_header),
         imap_uid = COALESCE($26, imap_uid), imap_folder = COALESCE($27, imap_folder),
         is_draft = $28`,
      [
        msg.id,
        msg.accountId,
        msg.threadId,
        msg.fromAddress,
        msg.fromName,
        msg.toAddresses,
        msg.ccAddresses,
        msg.bccAddresses,
        msg.replyTo,
        msg.subject,
        msg.snippet,
        msg.date,
        msg.isRead ? 1 : 0,
        msg.isStarred ? 1 : 0,
        msg.bodyHtml,
        msg.bodyText,
        msg.bodyHtml ? 1 : 0,
        msg.rawSize,
        msg.internalDate,
        msg.listUnsubscribe ?? null,
        msg.listUnsubscribePost ?? null,
        msg.authResults ?? null,
        msg.messageIdHeader ?? null,
        msg.referencesHeader ?? null,
        msg.inReplyToHeader ?? null,
        msg.imapUid ?? null,
        msg.imapFolder ?? null,
        msg.isDraft ? 1 : 0,
      ],
    );
  });
}

export async function deleteMessage(
  accountId: string,
  messageId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM message_embeddings WHERE account_id = $1 AND message_id = $2",
    [accountId, messageId],
  );
  await db.execute(
    "DELETE FROM messages WHERE account_id = $1 AND id = $2",
    [accountId, messageId],
  );
}

export async function updateMessageThreadIds(
  accountId: string,
  messageIds: string[],
  threadId: string,
): Promise<void> {
  const db = await getDb();
  // SQLite variable limit is 999; process in chunks
  for (let i = 0; i < messageIds.length; i += 500) {
    const chunk = messageIds.slice(i, i + 500);
    const placeholders = chunk.map((_, idx) => `$${idx + 3}`).join(", ");
    await db.execute(
      `UPDATE messages SET thread_id = $1 WHERE account_id = $2 AND id IN (${placeholders})`,
      [threadId, accountId, ...chunk],
    );
  }
}

export async function deleteMessagesForFolder(
  accountId: string,
  imapFolder: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM message_embeddings WHERE account_id = $1 AND message_id IN (
      SELECT id FROM messages WHERE account_id = $1 AND imap_folder = $2
    )`,
    [accountId, imapFolder],
  );
  await db.execute(
    "DELETE FROM messages WHERE account_id = $1 AND imap_folder = $2",
    [accountId, imapFolder],
  );
}

export async function getStoredImapUidsForFolder(
  accountId: string,
  imapFolder: string,
): Promise<{ id: string; uid: number }[]> {
  const db = await getDb();
  return db.select<{ id: string; uid: number }[]>(
    "SELECT id, imap_uid as uid FROM messages WHERE account_id = $1 AND imap_folder = $2 AND imap_uid IS NOT NULL",
    [accountId, imapFolder],
  );
}

export async function deleteAllMessagesForAccount(
  accountId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM message_embeddings WHERE account_id = $1",
    [accountId],
  );
  await db.execute(
    "DELETE FROM messages WHERE account_id = $1",
    [accountId],
  );
}

/**
 * Remove orphan placeholder threads — IMAP-style thread rows whose ID matches the
 * `imap-{accountId}-{folder}-{uid}` per-message placeholder pattern and that have no
 * messages pointing at them. These leak when the IMAP sync creates a placeholder
 * thread for a UID that was already saved locally (e.g. by saveSentMessageLocally)
 * and `imap_store_threads`'s orphan cleanup misses them in a later sync.
 */
export async function purgeOrphanPlaceholderThreads(accountId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT t.id FROM threads t
     WHERE t.account_id = $1
       AND t.id LIKE 'imap-' || $1 || '-%'
       AND NOT EXISTS (
         SELECT 1 FROM messages m
         WHERE m.account_id = t.account_id AND m.thread_id = t.id
       )`,
    [accountId],
  );
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map((_, j) => `$${j + 2}`).join(",");
    await db.execute(
      `DELETE FROM thread_labels WHERE account_id = $1 AND thread_id IN (${ph})`,
      [accountId, ...chunk],
    );
    await db.execute(
      `DELETE FROM threads WHERE account_id = $1 AND id IN (${ph})`,
      [accountId, ...chunk],
    );
  }
  return ids.length;
}

/**
 * Remove duplicate messages caused by the same RFC Message-ID being synced from
 * multiple IMAP folders (e.g. INBOX + a virtual "All Mail" folder that was previously
 * not excluded). For each (account_id, message_id_header, imap_folder) group that has
 * more than one record, keep the lowest imap_uid and delete the rest. Also cleans up
 * orphaned threads after deletion.
 */
export async function purgeImapDuplicates(accountId: string): Promise<number> {
  const db = await getDb();

  // Collect all victim (duplicate) message IDs in one CTE query — no per-victim loops
  const victims = await db.select<{ id: string; thread_id: string }[]>(
    `SELECT m.id, m.thread_id
     FROM messages m
     INNER JOIN (
       SELECT message_id_header, imap_folder, MIN(imap_uid) AS keep_uid
       FROM messages
       WHERE account_id = $1
         AND message_id_header IS NOT NULL
         AND imap_folder IS NOT NULL
         AND imap_uid IS NOT NULL
       GROUP BY message_id_header, imap_folder
       HAVING COUNT(*) > 1
     ) dupes
       ON m.message_id_header = dupes.message_id_header
      AND m.imap_folder = dupes.imap_folder
      AND m.imap_uid != dupes.keep_uid
     WHERE m.account_id = $1`,
    [accountId],
  );

  // Pass 2: same message_id_header + imap_folder + imap_uid — two rows for the
  // same physical server message (APPENDUID returned inconsistent UIDs on two
  // separate APPEND calls). Keep the row with the lowest rowid (oldest).
  const sameUidVictims = await db.select<{ id: string; thread_id: string }[]>(
    `SELECT m.id, m.thread_id
     FROM messages m
     INNER JOIN (
       SELECT message_id_header, imap_folder, imap_uid, MIN(rowid) AS keep_rowid
       FROM messages
       WHERE account_id = $1
         AND message_id_header IS NOT NULL
         AND imap_folder IS NOT NULL
         AND imap_uid IS NOT NULL
       GROUP BY message_id_header, imap_folder, imap_uid
       HAVING COUNT(*) > 1
     ) dupes
       ON m.message_id_header = dupes.message_id_header
      AND m.imap_folder = dupes.imap_folder
      AND m.imap_uid = dupes.imap_uid
      AND m.rowid != dupes.keep_rowid
     WHERE m.account_id = $1`,
    [accountId],
  );

  const allVictims = [...victims, ...sameUidVictims.filter((v) => !victims.some((p) => p.id === v.id))];

  if (allVictims.length === 0) return 0;

  const victimIds = allVictims.map((v) => v.id);
  const affectedThreadIds = [...new Set(allVictims.map((v) => v.thread_id))];

  // Batch deletes — 4–5 IPC calls total regardless of count (was 4–5 × N × M)
  const CHUNK = 500;
  for (let i = 0; i < victimIds.length; i += CHUNK) {
    const chunk = victimIds.slice(i, i + CHUNK);
    const ph = chunk.map((_, j) => `$${j + 2}`).join(",");
    await db.execute(
      `DELETE FROM message_embeddings WHERE account_id = $1 AND message_id IN (${ph})`,
      [accountId, ...chunk],
    );
    await db.execute(
      `DELETE FROM messages WHERE account_id = $1 AND id IN (${ph})`,
      [accountId, ...chunk],
    );
  }

  // Delete thread_labels + threads where no messages remain after purge
  if (affectedThreadIds.length > 0) {
    const tph = affectedThreadIds.map((_, j) => `$${j + 2}`).join(",");
    const surviving = await db.select<{ thread_id: string }[]>(
      `SELECT DISTINCT thread_id FROM messages WHERE account_id = $1 AND thread_id IN (${tph})`,
      [accountId, ...affectedThreadIds],
    );
    const survivingSet = new Set(surviving.map((r) => r.thread_id));
    const emptyThreadIds = affectedThreadIds.filter((id) => !survivingSet.has(id));

    if (emptyThreadIds.length > 0) {
      const eph = emptyThreadIds.map((_, j) => `$${j + 2}`).join(",");
      await db.execute(
        `DELETE FROM thread_labels WHERE account_id = $1 AND thread_id IN (${eph})`,
        [accountId, ...emptyThreadIds],
      );
      await db.execute(
        `DELETE FROM threads WHERE account_id = $1 AND id IN (${eph})`,
        [accountId, ...emptyThreadIds],
      );
    }
  }

  return victimIds.length;
}

/**
 * Get recent sent messages to a specific recipient.
 * Used to extract sender-specific tone/language for ghostwriter replies.
 */
export async function getRecentSentMessagesToAddress(
  accountId: string,
  accountEmail: string,
  recipientEmail: string,
  limit: number = 4,
): Promise<DbMessage[]> {
  const db = await getDb();
  return db.select<DbMessage[]>(
    `SELECT * FROM messages
     WHERE account_id = $1 AND LOWER(from_address) = LOWER($2)
       AND LOWER(to_addresses) LIKE '%' || LOWER($3) || '%'
       AND body_text IS NOT NULL AND LENGTH(body_text) > 30
     ORDER BY date DESC LIMIT $4`,
    [accountId, accountEmail, recipientEmail, limit],
  );
}

/**
 * Remove ghost draft messages: is_draft=1 rows that were left behind after a send
 * or discard. Two cases are handled:
 *
 * 1. Thread has no DRAFT label at all — draft was sent/discarded but the row wasn't
 *    cleaned up.
 * 2. Thread has DRAFT label AND also has INBOX or SENT label — the draft is a stuck
 *    reply draft in an inbox thread. A reply draft that is still being composed lives
 *    only in the composer store (in memory); if the thread is in INBOX/SENT, any
 *    is_draft=1 row older than 5 minutes is orphaned.
 *
 * Both cases produce is_read=0 rows that silently inflate unread counts.
 */
export async function purgeGhostDrafts(): Promise<number> {
  const db = await getDb();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

  const rows = await db.select<{ id: string }[]>(
    `SELECT m.id FROM messages m
     WHERE m.is_draft = 1
       AND (
         -- Case 1: thread has no DRAFT label at all
         NOT EXISTS (
           SELECT 1 FROM thread_labels tl
           WHERE tl.account_id = m.account_id
             AND tl.thread_id = m.thread_id
             AND tl.label_id = 'DRAFT'
         )
         OR
         -- Case 2: thread is in INBOX/SENT — reply draft that was never cleaned up
         (
           m.date < $1
           AND EXISTS (
             SELECT 1 FROM thread_labels tl2
             WHERE tl2.account_id = m.account_id
               AND tl2.thread_id = m.thread_id
               AND tl2.label_id IN ('INBOX', 'SENT')
           )
         )
       )`,
    [fiveMinutesAgo],
  );
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const ph = chunk.map((_, j) => `$${j + 1}`).join(",");
    await db.execute(`DELETE FROM message_embeddings WHERE message_id IN (${ph})`, chunk);
    await db.execute(`DELETE FROM messages WHERE id IN (${ph})`, chunk);
  }
  // Clean up DRAFT labels on threads that no longer have any draft messages
  await db.execute(
    `DELETE FROM thread_labels
     WHERE label_id = 'DRAFT'
       AND NOT EXISTS (
         SELECT 1 FROM messages m
         WHERE m.account_id = thread_labels.account_id
           AND m.thread_id = thread_labels.thread_id
           AND m.is_draft = 1
       )`,
  );
  console.log(`[db] purgeGhostDrafts: removed ${ids.length} stale draft message(s)`);
  return ids.length;
}

/**
 * Get recent sent messages for an account, matching from_address to account email.
 * Used for writing style analysis.
 */
export async function getRecentSentMessages(
  accountId: string,
  accountEmail: string,
  limit: number = 15,
): Promise<DbMessage[]> {
  const db = await getDb();
  return db.select<DbMessage[]>(
    `SELECT * FROM messages
     WHERE account_id = $1 AND LOWER(from_address) = LOWER($2)
       AND body_text IS NOT NULL AND LENGTH(body_text) > 50
     ORDER BY date DESC LIMIT $3`,
    [accountId, accountEmail, limit],
  );
}
