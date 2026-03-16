import { parseSearchQuery } from "./searchParser";
import { buildSearchQuery } from "./searchQueryBuilder";
import { getThreadLabelIds, getThreadById } from "@/services/db/threads";
import type { Thread } from "@/stores/threadStore";

/**
 * Replace dynamic date tokens in a query string.
 *  - __LAST_7_DAYS__  -> date 7 days ago (YYYY/MM/DD)
 *  - __LAST_30_DAYS__ -> date 30 days ago (YYYY/MM/DD)
 *  - __TODAY__        -> today's date (YYYY/MM/DD)
 */
export function resolveQueryTokens(query: string): string {
  const now = new Date();

  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  };

  let resolved = query;

  if (resolved.includes("__LAST_7_DAYS__")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    resolved = resolved.replace(/__LAST_7_DAYS__/g, formatDate(d));
  }

  if (resolved.includes("__LAST_30_DAYS__")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    resolved = resolved.replace(/__LAST_30_DAYS__/g, formatDate(d));
  }

  if (resolved.includes("__TODAY__")) {
    resolved = resolved.replace(/__TODAY__/g, formatDate(now));
  }

  return resolved;
}

/**
 * Build a SQL query for a smart folder's raw query string.
 * Resolves tokens, parses operators, and builds parameterized SQL.
 */
export function getSmartFolderSearchQuery(
  rawQuery: string,
  accountId: string,
  limit?: number,
): { sql: string; params: unknown[] } {
  const resolved = resolveQueryTokens(rawQuery);
  const parsed = parseSearchQuery(resolved);
  return buildSearchQuery(parsed, accountId, limit ?? 50);
}

/**
 * Build a COUNT query for unread messages matching a smart folder's query.
 * Returns { sql, params } where sql produces a single row with `count` column.
 */
export function getSmartFolderUnreadCount(
  rawQuery: string,
  accountId: string,
): { sql: string; params: unknown[] } {
  const resolved = resolveQueryTokens(rawQuery);
  const parsed = parseSearchQuery(resolved);

  // Force unread filter
  const withUnread = { ...parsed, isUnread: true };
  const { sql: baseSql, params } = buildSearchQuery(withUnread, accountId, 999999);

  // Replace SELECT ... FROM with SELECT COUNT(DISTINCT ...) FROM and remove LIMIT
  const countSql = baseSql
    .replace(/SELECT DISTINCT[\s\S]*?(?=\bFROM\s)/i, "SELECT COUNT(DISTINCT m.id) as count ")
    .replace(/ORDER BY[\s\S]*?(?=LIMIT|$)/i, "")
    .replace(/LIMIT \$\d+/i, "");

  // Remove the last param (which was the limit)
  const countParams = params.slice(0, -1);

  return { sql: countSql, params: countParams };
}

export interface SmartFolderRow {
  message_id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  date: number;
}

/**
 * Map raw smart folder search result rows to Thread objects,
 * enriching each with actual thread data (isRead, isStarred, etc.) from the DB.
 */
export async function mapSmartFolderRows(rows: SmartFolderRow[]): Promise<Thread[]> {
  // Deduplicate by thread_id, keeping the first occurrence
  const seen = new Set<string>();
  const uniqueRows = rows.filter((r) => {
    if (seen.has(r.thread_id)) return false;
    seen.add(r.thread_id);
    return true;
  });

  return Promise.all(
    uniqueRows.map(async (r) => {
      const [labelIds, dbThread] = await Promise.all([
        getThreadLabelIds(r.account_id, r.thread_id),
        getThreadById(r.account_id, r.thread_id),
      ]);
      const rawUrgency = dbThread?.ai_urgency;
      const urgency = (rawUrgency === "low" || rawUrgency === "medium" || rawUrgency === "high") ? rawUrgency : null;
      return {
        id: r.thread_id,
        accountId: r.account_id,
        subject: r.subject,
        snippet: r.snippet,
        lastMessageAt: r.date,
        messageCount: dbThread?.message_count ?? 1,
        isRead: dbThread ? dbThread.is_read === 1 : false,
        isStarred: dbThread ? dbThread.is_starred === 1 : false,
        isPinned: dbThread ? dbThread.is_pinned === 1 : false,
        isMuted: dbThread ? dbThread.is_muted === 1 : false,
        hasAttachments: dbThread ? dbThread.has_attachments === 1 : false,
        labelIds,
        fromName: r.from_name,
        fromAddress: r.from_address,
        aiUrgency: urgency,
      };
    }),
  );
}
