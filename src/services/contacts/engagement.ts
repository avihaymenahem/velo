import { queryWithRetry } from "@/services/db/connection";

export interface EngagementTrendPoint {
  date: string;
  score: number;
}

export async function logEngagement(contactId: string, eventType: string, scoreDelta: number): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO engagement_log (id, contact_id, event_type, score_delta, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [id, contactId, eventType, scoreDelta, now],
    );
  });
}

export async function getEngagementTrend(contactId: string, days = 30): Promise<EngagementTrendPoint[]> {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

  return queryWithRetry(async (db) => {
    const rows = await db.select<{ date: string; score: number }[]>(
      `SELECT date(created_at, 'unixepoch') as date, SUM(score_delta) as score
       FROM engagement_log
       WHERE contact_id = $1 AND created_at >= $2
       GROUP BY date(created_at, 'unixepoch')
       ORDER BY date ASC`,
      [contactId, cutoff],
    );

    return rows.map((r) => ({
      date: r.date,
      score: r.score,
    }));
  });
}
