import { getDb } from "./connection";

export async function isAllowlisted(
  accountId: string,
  senderAddress: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM image_allowlist WHERE account_id = $1 AND sender_address = $2 LIMIT 1",
    [accountId, senderAddress.toLowerCase()],
  );
  return rows.length > 0;
}

export async function addToAllowlist(
  accountId: string,
  senderAddress: string,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT OR IGNORE INTO image_allowlist (id, account_id, sender_address) VALUES ($1, $2, $3)",
    [id, accountId, senderAddress.toLowerCase()],
  );
}

export async function removeFromAllowlist(
  accountId: string,
  senderAddress: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM image_allowlist WHERE account_id = $1 AND sender_address = $2",
    [accountId, senderAddress.toLowerCase()],
  );
}

export interface AllowlistEntry {
  id: string;
  account_id: string;
  sender_address: string;
  created_at: number;
}

export async function getAllowlistForAccount(
  accountId: string,
): Promise<AllowlistEntry[]> {
  const db = await getDb();
  return db.select<AllowlistEntry[]>(
    "SELECT * FROM image_allowlist WHERE account_id = $1 ORDER BY sender_address",
    [accountId],
  );
}
