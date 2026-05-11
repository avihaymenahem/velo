import { getRecipientStats } from "@/services/db/campaignRecipients";

export interface CampaignStats {
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number;
  clickRate: number;
}

export async function getCampaignStats(
  campaignId: string,
): Promise<CampaignStats> {
  const stats = await getRecipientStats(campaignId);
  return {
    sent: stats.sent,
    opened: stats.opened,
    clicked: stats.clicked,
    bounced: stats.bounced,
    openRate: stats.total > 0 ? stats.opened / stats.total : 0,
    clickRate: stats.total > 0 ? stats.clicked / stats.total : 0,
  };
}
