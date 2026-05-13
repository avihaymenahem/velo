import { queryWithRetry, selectFirstBy } from "@/services/db/connection";

export interface SuppressionEntry {
  id: string;
  account_id: string;
  email: string;
  reason: string;
  suppressed_at: number;
}

export async function isSuppressed(accountId: string, email: string): Promise<boolean> {
  const row = await selectFirstBy<{ count: number }>(
    "SELECT COUNT(*) as count FROM suppression_list WHERE account_id = $1 AND email = $2",
    [accountId, email.toLowerCase()],
  );
  return (row?.count ?? 0) > 0;
}

export async function addToSuppression(accountId: string, email: string, reason: string): Promise<void> {
  await queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT OR IGNORE INTO suppression_list (id, account_id, email, reason) VALUES ($1, $2, $3, $4)",
      [id, accountId, email.toLowerCase(), reason],
    );
  });
}

export async function removeFromSuppression(accountId: string, email: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute(
      "DELETE FROM suppression_list WHERE account_id = $1 AND email = $2",
      [accountId, email.toLowerCase()],
    ),
  );
}

export async function getSuppressionList(accountId: string): Promise<SuppressionEntry[]> {
  return queryWithRetry(async (db) =>
    db.select<SuppressionEntry[]>(
      "SELECT * FROM suppression_list WHERE account_id = $1 ORDER BY suppressed_at DESC",
      [accountId],
    ),
  );
}
