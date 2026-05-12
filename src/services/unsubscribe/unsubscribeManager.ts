import { getDb } from "../db/connection";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fetch } from "@tauri-apps/plugin-http";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";
import { normalizeEmail } from "@/utils/emailUtils";

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]") {
      return false;
    }

    if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) {
      return false;
    }

    if (hostname.startsWith("172.")) {
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        const second = parseInt(parts[1]!, 10);
        if (second >= 16 && second <= 31) {
          return false;
        }
      }
    }

    if (hostname.startsWith("169.254.")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export interface ParsedUnsubscribe {
  httpUrl: string | null;
  mailtoAddress: string | null;
  hasOneClick: boolean;
}

export interface SubscriptionEntry {
  from_address: string;
  from_name: string | null;
  latest_unsubscribe_header: string;
  latest_unsubscribe_post: string | null;
  message_count: number;
  latest_date: number;
  status: string | null;
}

/**
 * Parse List-Unsubscribe and List-Unsubscribe-Post headers into actionable data.
 */
export function parseUnsubscribeHeaders(
  listUnsubscribe: string,
  listUnsubscribePost: string | null,
): ParsedUnsubscribe {
  const httpMatch = listUnsubscribe.match(/<(https?:\/\/[^>]+)>/);
  const mailtoMatch = listUnsubscribe.match(/<mailto:([^>]+)>/);
  const hasOneClick = !!listUnsubscribePost?.toLowerCase().includes("list-unsubscribe=one-click");

  return {
    httpUrl: httpMatch?.[1] ?? null,
    mailtoAddress: mailtoMatch?.[1] ?? null,
    hasOneClick,
  };
}

/**
 * Execute unsubscribe using the best available method:
 * 1. RFC 8058 one-click POST (no browser needed)
 * 2. mailto via Gmail API
 * 3. Fallback: open URL in browser
 */
export async function executeUnsubscribe(
  accountId: string,
  threadId: string,
  fromAddress: string,
  fromName: string | null,
  listUnsubscribe: string,
  listUnsubscribePost: string | null,
): Promise<{ method: string; success: boolean }> {
  const parsed = parseUnsubscribeHeaders(listUnsubscribe, listUnsubscribePost);

  let method = "browser";
  let success = false;

  // Method 1: RFC 8058 one-click HTTP POST
  if (parsed.hasOneClick && parsed.httpUrl && isSafeUrl(parsed.httpUrl)) {
    try {
      const response = await fetch(parsed.httpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new TextEncoder().encode("List-Unsubscribe=One-Click"),
      });
      success = response.ok || response.status === 200 || response.status === 202;
      method = "http_post";
    } catch (err) {
      console.error("One-click unsubscribe failed, trying fallback:", err);
    }
  }

  // Method 2: mailto via Gmail API
  if (!success && parsed.mailtoAddress) {
    try {
      const { getGmailClient } = await import("../gmail/tokenManager");
      const client = await getGmailClient(accountId);
      if (client) {
        const to = parsed.mailtoAddress.split("?")[0] ?? parsed.mailtoAddress;
        // Extract subject from mailto params if present
        const subjectMatch = parsed.mailtoAddress.match(/subject=([^&]+)/i);
        const subject = subjectMatch ? decodeURIComponent(subjectMatch[1]!) : "unsubscribe";

        const { getAccount } = await import("../db/accounts");
        const account = await getAccount(accountId);
        const { buildRawEmail } = await import("../../utils/emailBuilder");
        const raw = buildRawEmail({
          from: account?.email ?? "",
          to: [to],
          subject,
          htmlBody: "unsubscribe",
        });
        await client.sendMessage(raw);
        method = "mailto";
        success = true;
      }
    } catch (err) {
      console.error("Mailto unsubscribe failed, trying fallback:", err);
    }
  }

  // Method 3: open in browser
  if (!success && parsed.httpUrl && isSafeUrl(parsed.httpUrl)) {
    try {
      await openUrl(parsed.httpUrl);
      method = "browser";
      success = true;
    } catch (err) {
      console.error("Browser unsubscribe failed:", err);
    }
  }

  // Record the action
  await recordUnsubscribeAction(
    accountId,
    threadId,
    fromAddress,
    fromName,
    method,
    parsed.httpUrl ?? parsed.mailtoAddress ?? listUnsubscribe,
    success ? "unsubscribed" : "failed",
  );

  return { method, success };
}

async function recordUnsubscribeAction(
  accountId: string,
  threadId: string,
  fromAddress: string,
  fromName: string | null,
  method: string,
  url: string,
  status: string,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = getCurrentUnixTimestamp();
  await db.execute(
    `INSERT INTO unsubscribe_actions (id, account_id, thread_id, from_address, from_name, method, unsubscribe_url, status, unsubscribed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(account_id, from_address) DO UPDATE SET
       status = $8, unsubscribed_at = $9, method = $6, thread_id = $3`,
    [id, accountId, threadId, normalizeEmail(fromAddress), fromName, method, url, status, now],
  );
}

/**
 * Get all detectable newsletter/promo subscriptions for an account.
 */
export async function getSubscriptions(accountId: string): Promise<SubscriptionEntry[]> {
  const db = await getDb();
  return db.select<SubscriptionEntry[]>(
    `SELECT
       m.from_address,
       MAX(m.from_name) as from_name,
       MAX(m.list_unsubscribe) as latest_unsubscribe_header,
       MAX(m.list_unsubscribe_post) as latest_unsubscribe_post,
       COUNT(*) as message_count,
       MAX(m.date) as latest_date,
       ua.status
     FROM messages m
     LEFT JOIN unsubscribe_actions ua ON ua.account_id = m.account_id AND ua.from_address = LOWER(m.from_address)
     WHERE m.account_id = $1 AND m.list_unsubscribe IS NOT NULL
     GROUP BY LOWER(m.from_address)
     ORDER BY MAX(m.date) DESC`,
    [accountId],
  );
}

/**
 * Get unsubscribe status for a specific sender.
 */
export async function getUnsubscribeStatus(
  accountId: string,
  fromAddress: string,
): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ status: string }[]>(
    "SELECT status FROM unsubscribe_actions WHERE account_id = $1 AND from_address = $2",
    [accountId, normalizeEmail(fromAddress)],
  );
  return rows[0]?.status ?? null;
}
