import { getDb } from "./connection";

const TOMBSTONE_TTL_DAYS = 30;

export async function recordDeletedImapUid(
  accountId: string,
  folderPath: string,
  uid: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO deleted_imap_uids (account_id, folder_path, uid, deleted_at)
     VALUES ($1, $2, $3, unixepoch())`,
    [accountId, folderPath, uid],
  );
}

export async function isImapUidDeleted(
  accountId: string,
  folderPath: string,
  uid: number,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ uid: number }[]>(
    `SELECT uid FROM deleted_imap_uids WHERE account_id = $1 AND folder_path = $2 AND uid = $3`,
    [accountId, folderPath, uid],
  );
  return rows.length > 0;
}

export async function getDeletedImapUidsForFolder(
  accountId: string,
  folderPath: string,
): Promise<Set<number>> {
  const db = await getDb();
  const rows = await db.select<{ uid: number }[]>(
    `SELECT uid FROM deleted_imap_uids WHERE account_id = $1 AND folder_path = $2`,
    [accountId, folderPath],
  );
  return new Set(rows.map((r) => r.uid));
}

export async function pruneDeletedImapUids(): Promise<void> {
  const db = await getDb();
  const cutoff = Math.floor(Date.now() / 1000) - TOMBSTONE_TTL_DAYS * 86400;
  await db.execute(
    `DELETE FROM deleted_imap_uids WHERE deleted_at < $1`,
    [cutoff],
  );
}
