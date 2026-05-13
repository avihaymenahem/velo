import { queryWithRetry, selectFirstBy } from "./connection";

export interface EmailWarming {
  id: string;
  account_id: string;
  enabled: number;
  start_volume: number;
  current_volume: number;
  target_volume: number;
  ramp_days: number;
  created_at: number;
  updated_at: number;
}

export interface WarmingLogRow {
  id: string;
  account_id: string;
  sent_date: string;
  volume: number;
  created_at: number;
}

export async function getWarmingPlan(accountId: string): Promise<EmailWarming | null> {
  return selectFirstBy<EmailWarming>(
    "SELECT * FROM email_warming WHERE account_id = $1",
    [accountId],
  );
}

export async function upsertWarmingPlan(accountId: string, plan: Partial<EmailWarming>): Promise<void> {
  await queryWithRetry(async (db) => {
    const existing = await db.select<EmailWarming[]>(
      "SELECT * FROM email_warming WHERE account_id = $1",
      [accountId],
    );
    if (existing.length > 0) {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const [key, value] of Object.entries(plan)) {
        sets.push(`${key} = $${idx++}`);
        params.push(value);
      }
      sets.push(`updated_at = ${idx++}`);
      params.push(Math.floor(Date.now() / 1000));
      params.push(accountId);
      await db.execute(
        `UPDATE email_warming SET ${sets.join(", ")} WHERE account_id = $${idx}`,
        params,
      );
    } else {
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await db.execute(
        `INSERT INTO email_warming (id, account_id, enabled, start_volume, current_volume, target_volume, ramp_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, accountId, plan.enabled ?? 0, plan.start_volume ?? 10, plan.current_volume ?? 10, plan.target_volume ?? 100, plan.ramp_days ?? 14, now, now],
      );
    }
  });
}

export async function logWarmingVolume(accountId: string, volume: number): Promise<void> {
  await queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    await db.execute(
      "INSERT INTO warming_log (id, account_id, sent_date, volume) VALUES ($1, $2, $3, $4)",
      [id, accountId, today, volume],
    );
  });
}

export async function getWarmingLogs(accountId: string): Promise<WarmingLogRow[]> {
  return queryWithRetry(async (db) =>
    db.select<WarmingLogRow[]>(
      "SELECT * FROM warming_log WHERE account_id = $1 ORDER BY sent_date ASC",
      [accountId],
    ),
  );
}

export async function getLastWarmingLogDate(accountId: string): Promise<string | null> {
  const row = await selectFirstBy<{ sent_date: string }>(
    "SELECT sent_date FROM warming_log WHERE account_id = $1 ORDER BY sent_date DESC LIMIT 1",
    [accountId],
  );
  return row?.sent_date ?? null;
}
