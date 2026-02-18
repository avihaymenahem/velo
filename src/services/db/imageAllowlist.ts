import { getDb } from "./connection";
import { normalizeEmail } from "@/utils/emailUtils";

export async function isAllowlisted(
  accountId: string,
  senderAddress: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM image_allowlist WHERE account_id = $1 AND sender_address = $2 LIMIT 1",
    [accountId, normalizeEmail(senderAddress)],
  );
  return rows.length > 0;
}

/**
 * Batch-check which senders are allowlisted in a single query.
 */
export async function getAllowlistedSenders(
  accountId: string,
  senderAddresses: string[],
): Promise<Set<string>> {
  if (senderAddresses.length === 0) return new Set();
  const db = await getDb();
  const normalized = senderAddresses.map(normalizeEmail);
  const placeholders = normalized.map((_, i) => `$${i + 2}`).join(", ");
  const rows = await db.select<{ sender_address: string }[]>(
    `SELECT sender_address FROM image_allowlist WHERE account_id = $1 AND sender_address IN (${placeholders})`,
    [accountId, ...normalized],
  );
  return new Set(rows.map((r) => r.sender_address));
}

export async function addToAllowlist(
  accountId: string,
  senderAddress: string,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT OR IGNORE INTO image_allowlist (id, account_id, sender_address) VALUES ($1, $2, $3)",
    [id, accountId, normalizeEmail(senderAddress)],
  );
}

export async function removeFromAllowlist(
  accountId: string,
  senderAddress: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM image_allowlist WHERE account_id = $1 AND sender_address = $2",
    [accountId, normalizeEmail(senderAddress)],
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
