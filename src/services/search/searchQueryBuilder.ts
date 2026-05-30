import type { ParsedSearchQuery } from "./searchParser";

interface BuiltQuery {
  sql: string;
  params: unknown[];
}

/**
 * Build a parameterized SQL query from a parsed search query.
 * Returns { sql, params } for safe execution.
 *
 * @param excludeSystemLabels - When true, threads in TRASH or SPAM are excluded
 *   unless the query already filters by those labels (mirrors Gmail's default behaviour).
 */
export function buildSearchQuery(
  parsed: ParsedSearchQuery,
  accountId?: string | string[],
  limit = 50,
  excludeSystemLabels = false,
  orderByDate = false,
): BuiltQuery {
  const params: unknown[] = [];
  let paramIdx = 1;

  const whereClauses: string[] = [];
  let needsFts = false;

  // Base query - we'll add FTS join conditionally
  let fromClause = "FROM messages m";

  // Free text search via FTS5
  if (parsed.freeText) {
    needsFts = true;
    fromClause = "FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid";
    whereClauses.push(`messages_fts MATCH $${paramIdx}`);
    params.push(parsed.freeText);
    paramIdx++;
  }

  // Account filter
  if (Array.isArray(accountId)) {
    if (accountId.length > 0) {
      const placeholders = accountId.map((_, i) => `$${paramIdx + i}`).join(", ");
      whereClauses.push(`m.account_id IN (${placeholders})`);
      params.push(...accountId);
      paramIdx += accountId.length;
    }
  } else if (accountId) {
    whereClauses.push(`m.account_id = $${paramIdx}`);
    params.push(accountId);
    paramIdx++;
  }

  // from: operator
  if (parsed.from) {
    whereClauses.push(`(m.from_address LIKE '%' || $${paramIdx} || '%' OR m.from_name LIKE '%' || $${paramIdx} || '%')`);
    params.push(parsed.from);
    paramIdx++;
  }

  // to: operator
  if (parsed.to) {
    whereClauses.push(`m.to_addresses LIKE '%' || $${paramIdx} || '%'`);
    params.push(parsed.to);
    paramIdx++;
  }

  // subject: operator
  if (parsed.subject) {
    whereClauses.push(`m.subject LIKE '%' || $${paramIdx} || '%'`);
    params.push(parsed.subject);
    paramIdx++;
  }

  // has:attachment — exclude inline CID images (e.g. signature logos)
  if (parsed.hasAttachment) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM attachments a WHERE a.account_id = m.account_id AND a.message_id = m.id AND a.is_inline = 0)`,
    );
  }

  // has:calendar — messages with .ics attachments or calendar MIME type
  if (parsed.hasCalendar) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM attachments a WHERE a.account_id = m.account_id AND a.message_id = m.id AND (a.mime_type LIKE '%calendar%' OR a.filename LIKE '%.ics'))`,
    );
  }

  // is:unread
  if (parsed.isUnread) {
    whereClauses.push(`m.is_read = 0`);
    whereClauses.push(`m.is_draft = 0`);
  }

  // is:read
  if (parsed.isRead) {
    whereClauses.push(`m.is_read = 1`);
  }

  // is:starred
  if (parsed.isStarred) {
    whereClauses.push(`m.is_starred = 1`);
  }

  // before: date
  if (parsed.before !== undefined) {
    whereClauses.push(`m.date < $${paramIdx}`);
    params.push(parsed.before);
    paramIdx++;
  }

  // after: date
  if (parsed.after !== undefined) {
    whereClauses.push(`m.date > $${paramIdx}`);
    params.push(parsed.after);
    paramIdx++;
  }

  // label: operator
  if (parsed.label) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM thread_labels tl JOIN labels l ON l.account_id = tl.account_id AND l.id = tl.label_id WHERE tl.account_id = m.account_id AND tl.thread_id = m.thread_id AND LOWER(l.name) = LOWER($${paramIdx}))`,
    );
    params.push(parsed.label);
    paramIdx++;
  }

  // Exclude TRASH and SPAM unless the query explicitly targets those labels.
  // DRAFT is excluded only for pure-draft threads (DRAFT without INBOX) — threads
  // with a draft reply in progress (DRAFT + INBOX) should still appear in smart folders.
  if (excludeSystemLabels && !parsed.label) {
    // Exclude threads that are in TRASH/SPAM but NOT in INBOX (fully trashed/spammed threads).
    // Threads with both INBOX and TRASH are valid (some messages individually trashed) and must
    // still appear in smart folders and badge counts.
    whereClauses.push(
      `NOT (EXISTS (SELECT 1 FROM thread_labels tl2 WHERE tl2.account_id = m.account_id AND tl2.thread_id = m.thread_id AND tl2.label_id IN ('TRASH', 'SPAM')) AND NOT EXISTS (SELECT 1 FROM thread_labels tl2i WHERE tl2i.account_id = m.account_id AND tl2i.thread_id = m.thread_id AND tl2i.label_id = 'INBOX'))`,
    );
    whereClauses.push(
      `NOT (EXISTS (SELECT 1 FROM thread_labels tl3 WHERE tl3.account_id = m.account_id AND tl3.thread_id = m.thread_id AND tl3.label_id = 'DRAFT') AND NOT EXISTS (SELECT 1 FROM thread_labels tl4 WHERE tl4.account_id = m.account_id AND tl4.thread_id = m.thread_id AND tl4.label_id = 'INBOX'))`,
    );
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const orderBy = orderByDate ? "ORDER BY m.date DESC" : needsFts ? "ORDER BY rank, m.date DESC" : "ORDER BY m.date DESC";

  params.push(limit);

  const sql = `SELECT DISTINCT
    m.id as message_id,
    m.account_id,
    m.thread_id,
    m.subject,
    m.from_name,
    m.from_address,
    m.snippet,
    m.date,
    ${needsFts ? "rank" : "0 as rank"}
  ${fromClause}
  ${whereStr}
  ${orderBy}
  LIMIT $${paramIdx}`;

  return { sql, params };
}
