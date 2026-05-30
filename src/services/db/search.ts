import { getDb } from "./connection";
import { parseSearchQuery, hasSearchOperators } from "../search/searchParser";
import { buildSearchQuery } from "../search/searchQueryBuilder";

export interface SenderSuggestion {
  from_address: string;
  from_name: string | null;
  message_count: number;
}

/**
 * Search distinct senders in threads with a given label (e.g. 'INBOX').
 * - labelId null  → search across all messages (allmail context)
 * - accountId null → search across all accounts (unified-inbox context)
 */
export async function searchSendersByLabel(
  query: string,
  accountId: string | null,
  labelId: string | null,
  limit = 6,
): Promise<SenderSuggestion[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const q = query.trim();

  // Build WHERE clauses dynamically to handle null accountId / labelId
  const conditions: string[] = [
    "m.from_address != ''",
    "(LOWER(m.from_name) LIKE '%' || LOWER($1) || '%' OR LOWER(m.from_address) LIKE '%' || LOWER($1) || '%')",
  ];
  const params: unknown[] = [q];
  let idx = 2;

  if (accountId) {
    conditions.push(`m.account_id = $${idx++}`);
    params.push(accountId);
  }

  const fromClause = labelId
    ? `FROM messages m JOIN thread_labels tl ON tl.account_id = m.account_id AND tl.thread_id = m.thread_id AND tl.label_id = $${idx++}`
    : `FROM messages m`;

  if (labelId) params.push(labelId);

  params.push(limit);

  return db.select<SenderSuggestion[]>(
    `SELECT m.from_address, m.from_name, COUNT(*) as message_count
     ${fromClause}
     WHERE ${conditions.join(" AND ")}
     GROUP BY m.from_address
     ORDER BY message_count DESC
     LIMIT $${idx}`,
    params,
  );
}

export interface RecipientSuggestion {
  address: string;
  name: string | null;
  message_count: number;
}

/**
 * Parse a raw To/Cc address header string into individual address entries.
 * Handles "Name <email>" and bare "email" formats.
 */
function parseAddressHeader(raw: string): Array<{ address: string; name: string | null }> {
  // Split on commas that are not inside angle brackets
  const parts = raw.split(/,(?![^<]*>)/);
  const results: Array<{ address: string; name: string | null }> = [];
  for (const part of parts) {
    const p = part.trim();
    const namedMatch = p.match(/^"?([^"<>]*?)"?\s*<([^>]+)>\s*$/);
    if (namedMatch) {
      const name = namedMatch[1]!.trim() || null;
      const address = namedMatch[2]!.trim().toLowerCase();
      if (address.includes("@")) results.push({ name, address });
      continue;
    }
    const emailMatch = p.match(/^[\w.+\-']+@[\w.\-]+\.[a-z]{2,}$/i);
    if (emailMatch) {
      results.push({ name: null, address: p.toLowerCase() });
    }
  }
  return results;
}

/**
 * Search distinct recipients in SENT threads whose name or address matches the query.
 * Fetches raw to_addresses strings from DB and parses them in JS.
 * accountId null → search across all accounts.
 */
export async function searchSentRecipients(
  query: string,
  accountId: string | null,
  limit = 6,
): Promise<RecipientSuggestion[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const q = query.trim().toLowerCase();

  const accountClause = accountId ? "AND m.account_id = $3" : "";
  const params: unknown[] = [q, accountId ? 300 : 300];
  if (accountId) params.splice(1, 0, accountId); // insert before limit

  const rows = await db.select<Array<{ to_addresses: string }>>(
    `SELECT m.to_addresses
     FROM messages m
     JOIN thread_labels tl
       ON tl.account_id = m.account_id
      AND tl.thread_id  = m.thread_id
      AND tl.label_id   = 'SENT'
     WHERE m.to_addresses IS NOT NULL
       AND m.to_addresses != ''
       AND LOWER(m.to_addresses) LIKE '%' || $1 || '%'
       ${accountClause}
     LIMIT $${accountId ? 3 : 2}`,
    accountId ? [q, accountId, 300] : [q, 300],
  );

  // Parse all address strings, keep only those matching the query, count occurrences
  const counts = new Map<string, { name: string | null; count: number }>();
  for (const row of rows) {
    for (const { address, name } of parseAddressHeader(row.to_addresses)) {
      if (!address.includes(q) && !(name ?? "").toLowerCase().includes(q)) continue;
      const existing = counts.get(address);
      if (existing) {
        existing.count++;
        if (!existing.name && name) existing.name = name;
      } else {
        counts.set(address, { name, count: 1 });
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([address, { name, count }]) => ({ address, name, message_count: count }));
}

export interface SearchResult {
  message_id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  from_name: string | null;
  from_address: string | null;
  snippet: string | null;
  date: number;
  rank: number;
}

/**
 * Full-text search across messages using FTS5.
 * Supports search operators: from:, to:, subject:, has:attachment, is:unread, etc.
 */
export async function searchMessages(
  query: string,
  accountId?: string,
  limit = 50,
  orderByDate = false,
): Promise<SearchResult[]> {
  const db = await getDb();

  const ftsQuery = query.trim();
  if (!ftsQuery) return [];

  const order = orderByDate ? "m.date DESC" : "rank, m.date DESC";

  // Check if query contains search operators
  if (hasSearchOperators(ftsQuery)) {
    const parsed = parseSearchQuery(ftsQuery);
    // If we have no free text and no operators matched usefully, fall through
    if (parsed.freeText || parsed.from || parsed.to || parsed.subject ||
        parsed.hasAttachment || parsed.isUnread || parsed.isRead ||
        parsed.isStarred || parsed.before !== undefined || parsed.after !== undefined ||
        parsed.label) {
      const { sql, params } = buildSearchQuery(parsed, accountId, limit, false, orderByDate);
      return db.select<SearchResult[]>(sql, params);
    }
  }

  // Fall through to standard FTS5 search
  if (accountId) {
    return db.select<SearchResult[]>(
      `SELECT
        m.id as message_id,
        m.account_id,
        m.thread_id,
        m.subject,
        m.from_name,
        m.from_address,
        m.snippet,
        m.date,
        rank
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE messages_fts MATCH $1 AND m.account_id = $2
      ORDER BY ${order}
      LIMIT $3`,
      [ftsQuery, accountId, limit],
    );
  }

  return db.select<SearchResult[]>(
    `SELECT
      m.id as message_id,
      m.account_id,
      m.thread_id,
      m.subject,
      m.from_name,
      m.from_address,
      m.snippet,
      m.date,
      rank
    FROM messages_fts
    JOIN messages m ON m.rowid = messages_fts.rowid
    WHERE messages_fts MATCH $1
    ORDER BY ${order}
    LIMIT $2`,
    [ftsQuery, limit],
  );
}
