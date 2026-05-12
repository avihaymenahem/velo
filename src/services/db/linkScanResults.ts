import { queryWithRetry } from "./connection";

export async function getCachedScanResult(
  accountId: string,
  messageId: string,
): Promise<string | null> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ result_json: string }[]>(
      "SELECT result_json FROM link_scan_results WHERE account_id = $1 AND message_id = $2 LIMIT 1",
      [accountId, messageId],
    );
    return rows[0]?.result_json ?? null;
  });
}

export async function cacheScanResult(
  accountId: string,
  messageId: string,
  resultJson: string,
): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute(
      "INSERT OR REPLACE INTO link_scan_results (account_id, message_id, result_json) VALUES ($1, $2, $3)",
      [accountId, messageId, resultJson],
    ),
  );
}

export async function deleteScanResults(accountId: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute(
      "DELETE FROM link_scan_results WHERE account_id = $1",
      [accountId],
    ),
  );
}
