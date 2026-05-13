import { queryWithRetry } from "@/services/db/connection";
import { getEngagementTimeSeries } from "@/services/db/campaignRecipients";

export interface DailyStat {
  date: string;
  opens: number;
  clicks: number;
}

export interface LinkStat {
  url: string;
  clicks: number;
}

export interface CampaignAnalytics {
  totalSent: number;
  uniqueOpens: number;
  totalClicks: number;
  bouncedCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  dailyStats: DailyStat[];
  topLinks: LinkStat[];
}

export interface OverviewStats {
  totalCampaigns: number;
  totalSent: number;
  totalOpens: number;
  totalClicks: number;
  totalBounced: number;
  averageOpenRate: number;
  averageClickRate: number;
}

export async function getCampaignAnalytics(
  campaignId: string,
): Promise<CampaignAnalytics> {
  const [stats, dailyStats, linkRows] = await Promise.all([
    queryWithRetry(async (db) => {
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
           SUM(CASE WHEN status IN ('sent','opened','clicked') THEN 1 ELSE 0 END) as sent,
           SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
           SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
           SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
         FROM campaign_recipients WHERE campaign_id = $1`,
        [campaignId],
      );
      return rows[0] ?? {
        total: 0, sent: 0, opened: 0, clicked: 0, bounced: 0,
      };
    }),
    getEngagementTimeSeries(campaignId),
    queryWithRetry(async (db) =>
      db.select<{ url: string; click_count: number }[]>(
        "SELECT url, click_count FROM utm_links WHERE campaign_id = $1 ORDER BY click_count DESC LIMIT 10",
        [campaignId],
      ),
    ),
  ]);

  const total = stats.total || 1;
  return {
    totalSent: stats.sent,
    uniqueOpens: stats.opened,
    totalClicks: stats.clicked,
    bouncedCount: stats.bounced,
    openRate: stats.opened / total,
    clickRate: stats.clicked / total,
    bounceRate: stats.bounced / total,
    dailyStats,
    topLinks: linkRows.map((r) => ({ url: r.url, clicks: r.click_count })),
  };
}

export async function getOverview(
  accountId: string,
): Promise<OverviewStats> {
  const rows = await queryWithRetry(async (db) =>
    db.select<
      {
        campaign_count: number;
        total_sent: number;
        total_opens: number;
        total_clicks: number;
        total_bounced: number;
      }[]
    >(
      `SELECT
         (SELECT COUNT(*) FROM campaigns WHERE account_id = $1) as campaign_count,
         COALESCE(SUM(CASE WHEN cr.status IN ('sent','opened','clicked') THEN 1 ELSE 0 END), 0) as total_sent,
         COALESCE(SUM(CASE WHEN cr.opened_at IS NOT NULL THEN 1 ELSE 0 END), 0) as total_opens,
         COALESCE(SUM(CASE WHEN cr.clicked_at IS NOT NULL THEN 1 ELSE 0 END), 0) as total_clicks,
         COALESCE(SUM(CASE WHEN cr.status = 'bounced' THEN 1 ELSE 0 END), 0) as total_bounced
       FROM campaigns c
       LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id
       WHERE c.account_id = $1`,
      [accountId],
    ),
  );

  const r = rows[0] ?? {
    campaign_count: 0, total_sent: 0, total_opens: 0, total_clicks: 0, total_bounced: 0,
  };

  return {
    totalCampaigns: r.campaign_count,
    totalSent: r.total_sent,
    totalOpens: r.total_opens,
    totalClicks: r.total_clicks,
    totalBounced: r.total_bounced,
    averageOpenRate: r.total_sent > 0 ? r.total_opens / r.total_sent : 0,
    averageClickRate: r.total_sent > 0 ? r.total_clicks / r.total_sent : 0,
  };
}

export async function takeAnalyticsSnapshot(
  campaignId: string,
): Promise<void> {
  const analytics = await getCampaignAnalytics(campaignId);
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO analytics_snapshots (id, campaign_id, snapshot_data) VALUES ($1, $2, $3)",
      [crypto.randomUUID(), campaignId, JSON.stringify(analytics)],
    );
  });
}
