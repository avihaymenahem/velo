import { getRecipientStats, getEngagementTimeSeries } from "@/services/db/campaignRecipients";

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

export interface TrackingConfig {
  campaignId: string;
  contactId: string;
  baseUrl: string;
}

export function injectTrackingPixel(html: string, config: TrackingConfig): string {
  const pixelUrl = `${config.baseUrl}/track/open?campaign_id=${config.campaignId}&contact_id=${config.contactId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />`;
  const bodyCloseIdx = html.lastIndexOf("</body>");
  if (bodyCloseIdx === -1) {
    const lastTag = html.lastIndexOf("</table>");
    if (lastTag === -1) return html + pixel;
    return html.slice(0, lastTag) + pixel + html.slice(lastTag);
  }
  return html.slice(0, bodyCloseIdx) + pixel + html.slice(bodyCloseIdx);
}

export function wrapLinks(html: string, config: TrackingConfig): string {
  const trackingBase = `${config.baseUrl}/track/click?campaign_id=${config.campaignId}&contact_id=${config.contactId}&url=`;
  return html.replace(
    /<a\s+([^>]*?)href="([^"]+)"([^>]*?)>/gi,
    (_match, before, url, after) => {
      if (url.startsWith("#") || url.startsWith("{{")) return _match;
      const encodedUrl = encodeURIComponent(url);
      return `<a ${before}href="${trackingBase}${encodedUrl}"${after}>`;
    },
  );
}

export async function getCampaignTimeSeries(campaignId: string) {
  return getEngagementTimeSeries(campaignId);
}

export function generateCsvData(
  stats: CampaignStats,
  timeSeries: { date: string; opens: number; clicks: number }[],
): string {
  const header = "Metric,Value";
  const summaryRows = [
    `Sent,${stats.sent}`,
    `Opened,${stats.opened}`,
    `Clicked,${stats.clicked}`,
    `Bounced,${stats.bounced}`,
    `Open Rate,${(stats.openRate * 100).toFixed(1)}%`,
    `Click Rate,${(stats.clickRate * 100).toFixed(1)}%`,
  ];
  const timeHeader = "\nDate,Opens,Clicks";
  const timeRows = timeSeries.map((d) => `${d.date},${d.opens},${d.clicks}`).join("\n");
  return [header, ...summaryRows, timeHeader, timeRows].join("\n");
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
