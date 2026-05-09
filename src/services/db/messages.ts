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
}

export async function getMessagesForThread(
  accountId: string,
  threadId: string,
): Promise<DbMessage[]> {
  const db = await getDb();
  return db.select<DbMessage[]>(
    "SELECT * FROM messages WHERE account_id = $1 AND thread_id = $2 ORDER BY date ASC",
    [accountId, threadId],
  );
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
}): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      `INSERT INTO messages (id, account_id, thread_id, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, reply_to, subject, snippet, date, is_read, is_starred, body_html, body_text, body_cached, raw_size, internal_date, list_unsubscribe, list_unsubscribe_post, auth_results, message_id_header, references_header, in_reply_to_header, imap_uid, imap_folder)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
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
         imap_uid = COALESCE($26, imap_uid), imap_folder = COALESCE($27, imap_folder)`,
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
    "DELETE FROM messages WHERE account_id = $1",
    [accountId],
  );
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

  // Find duplicate groups: same account + RFC Message-ID + folder, more than one record
  const dupes = await db.select<{ message_id_header: string; imap_folder: string; keep_uid: number }[]>(
    `SELECT message_id_header, imap_folder, MIN(imap_uid) as keep_uid
     FROM messages
     WHERE account_id = $1
       AND message_id_header IS NOT NULL
       AND imap_folder IS NOT NULL
       AND imap_uid IS NOT NULL
     GROUP BY message_id_header, imap_folder
     HAVING COUNT(*) > 1`,
    [accountId],
  );

  if (dupes.length === 0) return 0;

  let deleted = 0;
  await withTransaction(async (db) => {
    for (const { message_id_header, imap_folder, keep_uid } of dupes) {
      const victims = await db.select<{ id: string; thread_id: string }[]>(
        `SELECT id, thread_id FROM messages
         WHERE account_id = $1 AND message_id_header = $2 AND imap_folder = $3 AND imap_uid != $4`,
        [accountId, message_id_header, imap_folder, keep_uid],
      );
      for (const { id, thread_id } of victims) {
        await db.execute("DELETE FROM messages WHERE id = $1 AND account_id = $2", [id, accountId]);
        deleted++;
        const remaining = await db.select<{ c: number }[]>(
          "SELECT COUNT(*) as c FROM messages WHERE thread_id = $1 AND account_id = $2",
          [thread_id, accountId],
        );
        if ((remaining[0]?.c ?? 1) === 0) {
          await db.execute("DELETE FROM thread_labels WHERE thread_id = $1 AND account_id = $2", [thread_id, accountId]);
          await db.execute("DELETE FROM threads WHERE id = $1 AND account_id = $2", [thread_id, accountId]);
        }
      }
    }
  });

  return deleted;
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
