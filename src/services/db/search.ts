import { getDb } from "./connection";
import { parseSearchQuery, hasSearchOperators } from "../search/searchParser";
import { buildSearchQuery } from "../search/searchQueryBuilder";

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
): Promise<SearchResult[]> {
  const db = await getDb();

  const ftsQuery = query.trim();
  if (!ftsQuery) return [];

  // Check if query contains search operators
  if (hasSearchOperators(ftsQuery)) {
    const parsed = parseSearchQuery(ftsQuery);
    // If we have no free text and no operators matched usefully, fall through
    if (parsed.freeText || parsed.from || parsed.to || parsed.subject ||
        parsed.hasAttachment || parsed.isUnread || parsed.isRead ||
        parsed.isStarred || parsed.before !== undefined || parsed.after !== undefined ||
        parsed.label) {
      const { sql, params } = buildSearchQuery(parsed, accountId, limit);
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
      ORDER BY rank
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
    ORDER BY rank
    LIMIT $2`,
    [ftsQuery, limit],
  );
}
