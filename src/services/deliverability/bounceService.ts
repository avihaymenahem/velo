import { queryWithRetry, selectFirstBy } from "@/services/db/connection";
import { addToSuppression } from "./suppressionList";

export type BounceType = "hard" | "soft" | "policy";

export interface BounceRecord {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  recipient_email: string;
  bounce_type: BounceType;
  diagnostic_code: string | null;
  reason: string | null;
  bounced_at: number;
}

export interface BounceReport {
  totalBounces: number;
  hardBounces: number;
  softBounces: number;
  policyBounces: number;
  bounceRate: number;
  topReasons: { reason: string; count: number }[];
}

const HARD_PATTERNS = [
  /^5\d\d/, /^55[0-4]/, /user unknown/i, /does not exist/i,
  /no such (user|account|mailbox)/i, /invalid (recipient|address)/i,
  /address rejected/i, /mailbox (not found|does not exist)/i,
];

const SOFT_PATTERNS = [
  /^4\d\d/, /^45[0-2]/, /mailbox full/i, /try again later/i,
  /temporarily (rejected|unavailable)/i, /too many (connections|recipients)/i,
  /service (unavailable|temporarily)/i, /over quota/i,
];

const POLICY_PATTERNS = [
  /blocked/i, /rejected/i, /spam/i, /policy/i,
  /not allowed/i, /suspected spam/i, /message content/i,
];

export function classifyBounce(diagnosticCode: string | null, reason: string | null): BounceType {
  const text = `${diagnosticCode ?? ""} ${reason ?? ""}`;

  for (const p of HARD_PATTERNS) {
    if (p.test(text)) return "hard";
  }
  for (const p of SOFT_PATTERNS) {
    if (p.test(text)) return "soft";
  }
  for (const p of POLICY_PATTERNS) {
    if (p.test(text)) return "policy";
  }

  if (diagnosticCode) {
    if (diagnosticCode.startsWith("5")) return "hard";
    if (diagnosticCode.startsWith("4")) return "soft";
  }

  return "soft";
}

export async function processBounce(
  campaignId: string | null,
  contactId: string | null,
  recipientEmail: string,
  diagnosticCode: string | null,
  reason: string | null,
): Promise<BounceType> {
  const bounceType = classifyBounce(diagnosticCode, reason);

  await queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO bounces (id, campaign_id, contact_id, recipient_email, bounce_type, diagnostic_code, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, campaignId, contactId, recipientEmail, bounceType, diagnosticCode, reason],
    );
  });

  if (bounceType === "hard") {
    const accountId = await findAccountIdForEmail(recipientEmail);
    if (accountId) {
      await addToSuppression(accountId, recipientEmail, `hard_bounce: ${diagnosticCode ?? reason ?? "unknown"}`);
    }
  }

  if (bounceType === "policy") {
    console.warn(`Policy bounce for ${recipientEmail}: needs user review`);
  }

  if (bounceType === "soft") {
    const recentCount = await countRecentSoftBounces(recipientEmail);
    if (recentCount >= 3) {
      const accountId = await findAccountIdForEmail(recipientEmail);
      if (accountId) {
        await addToSuppression(accountId, recipientEmail, `soft_bounce_3x: ${diagnosticCode ?? reason ?? "unknown"}`);
      }
    }
  }

  return bounceType;
}

async function countRecentSoftBounces(email: string): Promise<number> {
  const threeDaysAgo = Math.floor(Date.now() / 1000) - 259200;
  const row = await selectFirstBy<{ count: number }>(
    "SELECT COUNT(*) as count FROM bounces WHERE recipient_email = $1 AND bounce_type = 'soft' AND bounced_at > $2",
    [email, threeDaysAgo],
  );
  return row?.count ?? 0;
}

async function findAccountIdForEmail(email: string): Promise<string | null> {
  const row = await selectFirstBy<{ id: string }>(
    "SELECT id FROM accounts WHERE email = $1 LIMIT 1",
    [email],
  );
  return row?.id ?? null;
}

export async function getBounceReport(accountId: string): Promise<BounceReport> {
  const stats = await queryWithRetry(async (db) => {
    const total = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM bounces WHERE campaign_id IN (SELECT id FROM campaigns WHERE account_id = $1)",
      [accountId],
    );
    const hard = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM bounces WHERE bounce_type = 'hard' AND campaign_id IN (SELECT id FROM campaigns WHERE account_id = $1)",
      [accountId],
    );
    const soft = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM bounces WHERE bounce_type = 'soft' AND campaign_id IN (SELECT id FROM campaigns WHERE account_id = $1)",
      [accountId],
    );
    const policy = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM bounces WHERE bounce_type = 'policy' AND campaign_id IN (SELECT id FROM campaigns WHERE account_id = $1)",
      [accountId],
    );
    const reasons = await db.select<{ reason: string; count: number }[]>(
      "SELECT COALESCE(reason, 'unknown') as reason, COUNT(*) as count FROM bounces WHERE campaign_id IN (SELECT id FROM campaigns WHERE account_id = $1) GROUP BY reason ORDER BY count DESC LIMIT 10",
      [accountId],
    );

    const totalCount = total[0]?.count ?? 0;
    return {
      totalBounces: totalCount,
      hardBounces: hard[0]?.count ?? 0,
      softBounces: soft[0]?.count ?? 0,
      policyBounces: policy[0]?.count ?? 0,
      bounceRate: 0,
      topReasons: reasons.map((r) => ({ reason: r.reason, count: r.count })),
    };
  });

  return stats;
}
