import { queryWithRetry } from "./connection";

export interface DbCampaignRecipient {
  campaign_id: string;
  contact_id: string;
  status: string;
  opened_at: number | null;
  clicked_at: number | null;
}

export async function addRecipient(
  campaignId: string,
  contactId: string,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT OR IGNORE INTO campaign_recipients (campaign_id, contact_id) VALUES ($1, $2)",
      [campaignId, contactId],
    );
  });
}

export async function addRecipientsBulk(
  campaignId: string,
  contactIds: string[],
): Promise<void> {
  await queryWithRetry(async (db) => {
    for (const contactId of contactIds) {
      await db.execute(
        "INSERT OR IGNORE INTO campaign_recipients (campaign_id, contact_id) VALUES ($1, $2)",
        [campaignId, contactId],
      );
    }
  });
}

export async function getRecipients(
  campaignId: string,
): Promise<DbCampaignRecipient[]> {
  return queryWithRetry(async (db) =>
    db.select<DbCampaignRecipient[]>(
      "SELECT * FROM campaign_recipients WHERE campaign_id = $1",
      [campaignId],
    )
  );
}

export async function getRecipientStats(campaignId: string): Promise<{
  total: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
}> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<
      {
        total: number;
        sent: number;
        opened: number;
        clicked: number;
        bounced: number;
      }[]
    >(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
         SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
         SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
         SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
       FROM campaign_recipients WHERE campaign_id = $1`,
      [campaignId],
    );
    const row = rows[0];
    return {
      total: row?.total ?? 0,
      sent: row?.sent ?? 0,
      opened: row?.opened ?? 0,
      clicked: row?.clicked ?? 0,
      bounced: row?.bounced ?? 0,
    };
  });
}

export async function updateRecipientStatus(
  campaignId: string,
  contactId: string,
  status: string,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE campaign_recipients SET status = $1 WHERE campaign_id = $2 AND contact_id = $3",
      [status, campaignId, contactId],
    );
  });
}

export async function removeRecipient(
  campaignId: string,
  contactId: string,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "DELETE FROM campaign_recipients WHERE campaign_id = $1 AND contact_id = $2",
      [campaignId, contactId],
    );
  });
}
