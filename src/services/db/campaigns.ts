import { getDb, selectFirstBy } from "./connection";

export interface DbCampaign {
  id: string;
  account_id: string;
  name: string;
  template_id: string | null;
  segment_id: string | null;
  status: string;
  sent_count: number;
  sent_at: number | null;
  created_at: number;
}

export async function getCampaigns(accountId: string): Promise<DbCampaign[]> {
  const db = await getDb();
  return db.select<DbCampaign[]>(
    "SELECT * FROM campaigns WHERE account_id = $1 ORDER BY created_at DESC",
    [accountId],
  );
}

export async function getCampaign(id: string): Promise<DbCampaign | null> {
  return selectFirstBy<DbCampaign>(
    "SELECT * FROM campaigns WHERE id = $1",
    [id],
  );
}

export async function createCampaign(
  accountId: string,
  name: string,
  templateId?: string,
  segmentId?: string,
): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO campaigns (id, account_id, name, template_id, segment_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, accountId, name, templateId ?? null, segmentId ?? null],
  );
  return id;
}

export async function updateCampaignStatus(
  id: string,
  status: string,
): Promise<void> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    "UPDATE campaigns SET status = $1, sent_at = CASE WHEN $2 = 'sent' THEN $3 ELSE sent_at END WHERE id = $4",
    [status, status, now, id],
  );
}

export async function incrementSentCount(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE campaigns SET sent_count = sent_count + 1 WHERE id = $1",
    [id],
  );
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM campaigns WHERE id = $1", [id]);
}
