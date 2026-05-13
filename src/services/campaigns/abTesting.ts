import { queryWithRetry, selectFirstBy } from "@/services/db/connection";

export interface ABTestConfig {
  variantA: { subject: string; body: string };
  variantB: { subject: string; body: string };
  splitRatio: number;
  winnerId: "A" | "B" | null;
  testDurationHours: number;
  startedAt: number | null;
  endedAt: number | null;
  significant: boolean;
  pValue: number | null;
}

export function chiSquareTest(
  aOpens: number,
  aTotal: number,
  bOpens: number,
  bTotal: number,
): { significant: boolean; pValue: number } {
  if (aTotal === 0 || bTotal === 0) {
    return { significant: false, pValue: 1 };
  }
  const aNonOpens = aTotal - aOpens;
  const bNonOpens = bTotal - bOpens;
  const n = aTotal + bTotal;
  const num = n * (aOpens * bNonOpens - bOpens * aNonOpens) ** 2;
  const den = aTotal * bTotal * (aOpens + bOpens) * (aNonOpens + bNonOpens);
  if (den === 0) {
    return { significant: false, pValue: 1 };
  }
  const chiSq = num / den;
  const z = Math.sqrt(chiSq);
  const pValue = 2 * (1 - normalCdf(z));
  return { significant: pValue < 0.05, pValue };
}

function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * y);
}

export async function createABTest(
  campaignId: string,
  config: ABTestConfig,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE campaigns SET ab_test_config = $1 WHERE id = $2",
      [JSON.stringify(config), campaignId],
    );
  });
}

export async function assignVariant(
  recipientId: string,
  splitRatio: number,
): Promise<"A" | "B"> {
  const encoder = new TextEncoder();
  const data = encoder.encode(recipientId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint32Array(hashBuffer);
  const hash = hashArray[0]! & 0x7fffffff;
  const normalized = (hash || 1) / 0x7fffffff;
  return normalized < splitRatio ? "A" : "B";
}

export async function setRecipientVariant(
  campaignId: string,
  contactId: string,
  variant: "A" | "B",
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE campaign_recipients SET variant = $1 WHERE campaign_id = $2 AND contact_id = $3",
      [variant, campaignId, contactId],
    );
  });
}

interface VariantStats {
  variant: "A" | "B";
  total: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
}

export async function getVariantStats(
  campaignId: string,
): Promise<{ a: VariantStats | null; b: VariantStats | null }> {
  const rows = await queryWithRetry(async (db) =>
    db.select<
      {
        variant: string;
        total: number;
        opens: number;
        clicks: number;
      }[]
    >(
      `SELECT
         variant,
         COUNT(*) as total,
         SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opens,
         SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicks
       FROM campaign_recipients
       WHERE campaign_id = $1 AND variant IS NOT NULL
       GROUP BY variant`,
      [campaignId],
    ),
  );

  const result: { a: VariantStats | null; b: VariantStats | null } = {
    a: null,
    b: null,
  };

  for (const row of rows) {
    const v = row.variant as "A" | "B";
    const total = row.total;
    const opens = row.opens;
    const clicks = row.clicks;
    const stats: VariantStats = {
      variant: v,
      total,
      opens,
      clicks,
      openRate: total > 0 ? opens / total : 0,
      clickRate: total > 0 ? clicks / total : 0,
    };
    if (v === "A") result.a = stats;
    else result.b = stats;
  }

  return result;
}

export async function runSignificanceTest(
  campaignId: string,
): Promise<{ significant: boolean; pValue: number }> {
  const config = await getABTestConfig(campaignId);
  if (!config) {
    return { significant: false, pValue: 1 };
  }

  const stats = await getVariantStats(campaignId);
  if (!stats.a || !stats.b) {
    return { significant: false, pValue: 1 };
  }

  const result = chiSquareTest(
    stats.a.opens,
    stats.a.total,
    stats.b.opens,
    stats.b.total,
  );

  config.significant = result.significant;
  config.pValue = result.pValue;
  config.endedAt = Math.floor(Date.now() / 1000);
  if (result.significant) {
    const aRate = stats.a.openRate;
    const bRate = stats.b.openRate;
    config.winnerId = aRate >= bRate ? "A" : "B";
  }

  await createABTest(campaignId, config);
  return result;
}

export async function declareWinner(campaignId: string): Promise<"A" | "B" | null> {
  const result = await runSignificanceTest(campaignId);
  if (!result.significant) return null;

  const config = await getABTestConfig(campaignId);
  return config?.winnerId ?? null;
}

export async function applyWinnerToRemaining(
  campaignId: string,
): Promise<void> {
  const config = await getABTestConfig(campaignId);
  if (!config?.winnerId) return;

  const winner = config.winnerId;
  const remaining = await queryWithRetry(async (db) =>
    db.select<{ contact_id: string }[]>(
      "SELECT contact_id FROM campaign_recipients WHERE campaign_id = $1 AND variant IS NULL AND status = 'pending'",
      [campaignId],
    ),
  );

  for (const r of remaining) {
    await queryWithRetry(async (db) => {
      await db.execute(
        "UPDATE campaign_recipients SET variant = $1, is_winner = 1 WHERE campaign_id = $2 AND contact_id = $3",
        [winner, campaignId, r.contact_id],
      );
    });
  }
}

export async function getABTestConfig(
  campaignId: string,
): Promise<ABTestConfig | null> {
  const row = await selectFirstBy<{ ab_test_config: string | null }>(
    "SELECT ab_test_config FROM campaigns WHERE id = $1",
    [campaignId],
  );
  if (!row?.ab_test_config) return null;
  return JSON.parse(row.ab_test_config) as ABTestConfig;
}

export async function shouldRunABTestDecision(
  campaignId: string,
): Promise<boolean> {
  const config = await getABTestConfig(campaignId);
  if (!config || config.winnerId || config.endedAt) return false;
  if (!config.startedAt) return false;
  const elapsed = Math.floor(Date.now() / 1000) - config.startedAt;
  const durationSeconds = config.testDurationHours * 3600;
  if (elapsed < durationSeconds) return false;
  const uncategorized = await queryWithRetry(async (db) => {
    const rows = await db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) as cnt FROM campaign_recipients WHERE campaign_id = $1 AND variant IS NULL",
      [campaignId],
    );
    return rows[0]?.cnt ?? 0;
  });
  return uncategorized > 0;
}
