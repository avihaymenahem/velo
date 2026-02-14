import { getDb, selectFirstBy } from "./connection";

export interface FolderSyncState {
  account_id: string;
  folder_path: string;
  uidvalidity: number | null;
  last_uid: number;
  modseq: number | null;
  last_sync_at: number | null;
}

export async function getFolderSyncState(
  accountId: string,
  folderPath: string,
): Promise<FolderSyncState | null> {
  return selectFirstBy<FolderSyncState>(
    "SELECT * FROM folder_sync_state WHERE account_id = $1 AND folder_path = $2",
    [accountId, folderPath],
  );
}

export async function upsertFolderSyncState(
  state: FolderSyncState,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO folder_sync_state (account_id, folder_path, uidvalidity, last_uid, modseq, last_sync_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(account_id, folder_path) DO UPDATE SET
       uidvalidity = $3, last_uid = $4, modseq = $5, last_sync_at = $6`,
    [
      state.account_id,
      state.folder_path,
      state.uidvalidity,
      state.last_uid,
      state.modseq,
      state.last_sync_at,
    ],
  );
}

export async function deleteFolderSyncState(
  accountId: string,
  folderPath: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM folder_sync_state WHERE account_id = $1 AND folder_path = $2",
    [accountId, folderPath],
  );
}

export async function getAllFolderSyncStates(
  accountId: string,
): Promise<FolderSyncState[]> {
  const db = await getDb();
  return db.select<FolderSyncState[]>(
    "SELECT * FROM folder_sync_state WHERE account_id = $1 ORDER BY folder_path ASC",
    [accountId],
  );
}
