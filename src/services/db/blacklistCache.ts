import { queryWithRetry, selectFirstBy } from "./connection";

export interface BlacklistCheckRow {
  id: string;
  account_id: string;
  check_type: string;
  target: string;
  listed: number;
  list_name: string | null;
  responded: number;
  checked_at: number;
}

export async function getCachedCheck(accountId: string, checkType: string, target: string): Promise<BlacklistCheckRow | null> {
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  return selectFirstBy<BlacklistCheckRow>(
    "SELECT * FROM blacklist_checks WHERE account_id = $1 AND check_type = $2 AND target = $3 AND checked_at > $4 ORDER BY checked_at DESC LIMIT 1",
    [accountId, checkType, target, oneHourAgo],
  );
}

export async function cacheCheck(
  accountId: string,
  checkType: string,
  target: string,
  listed: boolean,
  listName: string | null,
  responded: boolean,
): Promise<void> {
  await queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO blacklist_checks (id, account_id, check_type, target, listed, list_name, responded) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, accountId, checkType, target, listed ? 1 : 0, listName, responded ? 1 : 0],
    );
  });
}

export async function getBlacklistHistory(accountId: string): Promise<BlacklistCheckRow[]> {
  return queryWithRetry(async (db) =>
    db.select<BlacklistCheckRow[]>(
      "SELECT * FROM blacklist_checks WHERE account_id = $1 ORDER BY checked_at DESC LIMIT 100",
      [accountId],
    ),
  );
}
