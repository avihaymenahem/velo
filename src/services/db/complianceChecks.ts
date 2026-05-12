import { queryWithRetry } from "./connection";

export interface DbComplianceCheck {
  id: string;
  account_id: string;
  email_draft_id: string | null;
  campaign_id: string | null;
  profile_ids: string;
  score: number;
  violations_json: string | null;
  checked_at: number;
}

export async function getRecentChecks(
  accountId: string,
  limit: number = 10,
): Promise<DbComplianceCheck[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbComplianceCheck[]>(
      "SELECT * FROM compliance_checks WHERE account_id = $1 ORDER BY checked_at DESC LIMIT $2",
      [accountId, limit],
    );
  });
}

export async function deleteOldChecks(before: number): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "DELETE FROM compliance_checks WHERE checked_at < $1",
      [before],
    );
  });
}
