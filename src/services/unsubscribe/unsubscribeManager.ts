import { getDb } from "../db/connection";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fetch } from "@tauri-apps/plugin-http";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";
import { normalizeEmail } from "@/utils/emailUtils";

/**
 * Validate that a URL is safe to request (not targeting private/internal networks).
 * Blocks loopback, private IP ranges, link-local, IPv6 private ranges, and non-http(s) schemes.
 * Note: DNS rebinding attacks are a known limitation — hostname-based checks cannot
 * prevent a public hostname from resolving to a private IP at fetch time.
 */
export function isSafeUrl(urlStr: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  // URL.hostname returns brackets for IPv6 (e.g., "[::1]"), and normalizes
  // IPv4-mapped addresses to hex (e.g., "::ffff:127.0.0.1" → "[::ffff:7f00:1]")
  const hostname = parsed.hostname.toLowerCase();

  // Block loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return false;
  }

  // Block IPv6 private/reserved ranges
  if (hostname.startsWith("[")) {
    const ipv6 = hostname.slice(1, -1); // strip brackets
    // IPv6 unique-local (fc00::/7)
    if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) return false;
    // IPv6 link-local (fe80::/10)
    if (ipv6.startsWith("fe80")) return false;
    // IPv4-mapped IPv6 — URL normalizes to hex (::ffff:7f00:1 for 127.0.0.1)
    // Parse the last two 16-bit groups back to IPv4 octets
    const mappedMatch = ipv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedMatch) {
      const hi = parseInt(mappedMatch[1]!, 16);
      const lo = parseInt(mappedMatch[2]!, 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isSafeUrl(`${parsed.protocol}//${a}.${b}.${c}.${d}${parsed.pathname}${parsed.search}`);
    }
    // Full loopback (already normalized to [::1] above, but catch edge cases)
    if (ipv6 === "0:0:0:0:0:0:0:1") return false;
    return true;
  }

  // Block private/reserved IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10) return false;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return false;   // 172.16.0.0/12
    if (a === 192 && b === 168) return false;             // 192.168.0.0/16
    if (a === 169 && b === 254) return false;             // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 0) return false;                            // 0.0.0.0/8
    if (a === 127) return false;                          // 127.0.0.0/8
  }

  return true;
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
  if (parsed.hasOneClick && parsed.httpUrl) {
    if (!isSafeUrl(parsed.httpUrl)) {
      console.warn("Blocked unsubscribe request to unsafe URL host:", new URL(parsed.httpUrl).hostname);
    } else {
      try {
        const response = await fetch(parsed.httpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new TextEncoder().encode("List-Unsubscribe=One-Click"),
          redirect: "manual",
        });
        success = response.ok || response.status === 200 || response.status === 202;
        method = "http_post";
      } catch (err) {
        console.error("One-click unsubscribe failed, trying fallback:", err);
      }
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
  if (!success && parsed.httpUrl) {
    if (!isSafeUrl(parsed.httpUrl)) {
      console.warn("Blocked opening unsafe unsubscribe URL host:", new URL(parsed.httpUrl).hostname);
    } else {
      try {
        await openUrl(parsed.httpUrl);
        method = "browser";
        success = true;
      } catch (err) {
        console.error("Browser unsubscribe failed:", err);
      }
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
