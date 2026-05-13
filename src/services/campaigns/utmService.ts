import { queryWithRetry, selectFirstBy } from "@/services/db/connection";

export interface UTMClick {
  id: string;
  contact_id: string;
  clicked_at: number;
}

export interface UTMReport {
  links: {
    id: string;
    url: string;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    clickCount: number;
    clicks: UTMClick[];
  }[];
}

interface DbLink {
  id: string;
  url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  click_count: number;
}

export function buildUTMUrl(
  url: string,
  params: {
    source: string;
    medium: string;
    campaign: string;
    content?: string;
  },
): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", params.source);
  u.searchParams.set("utm_medium", params.medium);
  u.searchParams.set("utm_campaign", params.campaign);
  if (params.content) {
    u.searchParams.set("utm_content", params.content);
  }
  return u.toString();
}

export async function trackUTMParams(
  url: string,
  campaignId: string,
  params?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  },
): Promise<string> {
  let finalUrl = url;
  if (params) {
    finalUrl = buildUTMUrl(url, {
      source: params.source ?? "email",
      medium: params.medium ?? "campaign",
      campaign: params.campaign ?? campaignId,
      content: params.content,
    });
  }

  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO utm_links (id, campaign_id, url, utm_source, utm_medium, utm_campaign, utm_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id, campaignId, finalUrl,
        params?.source ?? "email",
        params?.medium ?? "campaign",
        params?.campaign ?? campaignId,
        params?.content ?? null,
      ],
    );
  });

  return id;
}

export async function recordClick(
  linkId: string,
  contactId: string,
): Promise<void> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO utm_clicks (id, link_id, contact_id) VALUES ($1, $2, $3)",
      [id, linkId, contactId],
    );
    await db.execute(
      "UPDATE utm_links SET click_count = click_count + 1 WHERE id = $1",
      [linkId],
    );
  });
}

export async function getUTMReport(
  campaignId: string,
): Promise<UTMReport> {
  const dbLinks = await queryWithRetry(async (db) =>
    db.select<DbLink[]>(
      "SELECT * FROM utm_links WHERE campaign_id = $1 ORDER BY click_count DESC",
      [campaignId],
    ),
  );

  const links = await Promise.all(
    dbLinks.map(async (l) => {
      const clicks = await queryWithRetry(async (db) =>
        db.select<UTMClick[]>(
          "SELECT id, contact_id, clicked_at FROM utm_clicks WHERE link_id = $1 ORDER BY clicked_at DESC",
          [l.id],
        ),
      );
      return {
        id: l.id,
        url: l.url,
        utmSource: l.utm_source,
        utmMedium: l.utm_medium,
        utmCampaign: l.utm_campaign,
        utmContent: l.utm_content,
        clickCount: l.click_count,
        clicks,
      };
    }),
  );

  return { links };
}

export async function getUTMLink(
  linkId: string,
): Promise<{ id: string; url: string; campaign_id: string } | null> {
  return selectFirstBy<{ id: string; url: string; campaign_id: string }>(
    "SELECT id, url, campaign_id FROM utm_links WHERE id = $1",
    [linkId],
  );
}
