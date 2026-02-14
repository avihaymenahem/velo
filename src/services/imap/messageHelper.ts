import { getDb } from "../db/connection";
import type { DbMessage } from "../db/messages";

export interface ImapMessageInfo {
  uid: number;
  folder: string;
}

/**
 * Look up imap_uid and imap_folder from the messages DB table for the given message IDs.
 * Only returns entries where both imap_uid and imap_folder are non-null.
 */
export async function getImapUidsForMessages(
  accountId: string,
  messageIds: string[],
): Promise<Map<string, ImapMessageInfo>> {
  if (messageIds.length === 0) {
    return new Map();
  }

  const db = await getDb();
  const placeholders = messageIds.map((_, i) => `$${i + 2}`).join(", ");
  const rows = await db.select<
    Pick<DbMessage, "id" | "imap_uid" | "imap_folder">[]
  >(
    `SELECT id, imap_uid, imap_folder FROM messages WHERE account_id = $1 AND id IN (${placeholders})`,
    [accountId, ...messageIds],
  );

  const result = new Map<string, ImapMessageInfo>();
  for (const row of rows) {
    if (row.imap_uid != null && row.imap_folder != null) {
      result.set(row.id, { uid: row.imap_uid, folder: row.imap_folder });
    }
  }
  return result;
}

/**
 * Group IMAP UIDs by their folder path.
 */
export function groupMessagesByFolder(
  messages: Map<string, ImapMessageInfo>,
): Map<string, number[]> {
  const grouped = new Map<string, number[]>();
  for (const { uid, folder } of messages.values()) {
    const existing = grouped.get(folder);
    if (existing) {
      existing.push(uid);
    } else {
      grouped.set(folder, [uid]);
    }
  }
  return grouped;
}

/**
 * Find the folder path for a special-use folder (e.g. \\Trash, \\Junk, \\Sent, \\Drafts, \\Archive).
 * Looks up the labels table using the imap_special_use column.
 */
export async function findSpecialFolder(
  accountId: string,
  specialUse: string,
): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ imap_folder_path: string | null; name: string }[]>(
    "SELECT imap_folder_path, name FROM labels WHERE account_id = $1 AND imap_special_use = $2 LIMIT 1",
    [accountId, specialUse],
  );
  if (rows.length === 0) return null;
  // Prefer the actual IMAP folder path, fall back to label name
  return rows[0]!.imap_folder_path ?? rows[0]!.name;
}

/**
 * Map DB security values to ImapConfig/SmtpConfig security types.
 * DB stores 'ssl'/'starttls'/'none', but configs use 'tls'/'starttls'/'none'.
 */
export function securityToConfigType(
  dbSecurity: string,
): "tls" | "starttls" | "none" {
  switch (dbSecurity) {
    case "ssl":
      return "tls";
    case "starttls":
      return "starttls";
    case "none":
      return "none";
    default:
      return "tls";
  }
}

/**
 * Update the imap_folder column for messages after a move operation.
 */
export async function updateMessageImapFolder(
  accountId: string,
  messageIds: string[],
  newFolder: string,
): Promise<void> {
  if (messageIds.length === 0) return;

  const db = await getDb();
  const placeholders = messageIds.map((_, i) => `$${i + 3}`).join(", ");
  await db.execute(
    `UPDATE messages SET imap_folder = $1 WHERE account_id = $2 AND id IN (${placeholders})`,
    [newFolder, accountId, ...messageIds],
  );
}
