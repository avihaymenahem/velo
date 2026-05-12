import { queryWithRetry } from "./connection";
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

export interface UnifiedSearchResult {
  type: "message" | "file" | "task" | "contact";
  id: string;
  title: string;
  snippet: string | null;
  date: number;
  rank: number;
  account_id?: string;
  metadata?: Record<string, unknown>;
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
  const ftsQuery = query.trim();
  if (!ftsQuery) return [];

  if (hasSearchOperators(ftsQuery)) {
    const parsed = parseSearchQuery(ftsQuery);
    if (parsed.freeText || parsed.from || parsed.to || parsed.subject ||
        parsed.hasAttachment || parsed.isUnread || parsed.isRead ||
        parsed.isStarred || parsed.before !== undefined || parsed.after !== undefined ||
        parsed.label) {
      const { sql, params } = buildSearchQuery(parsed, accountId, limit);
      return queryWithRetry(async (db) => db.select<SearchResult[]>(sql, params));
    }
  }

  if (accountId) {
    return queryWithRetry(async (db) =>
      db.select<SearchResult[]>(
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
      ),
    );
  }

  return queryWithRetry(async (db) =>
    db.select<SearchResult[]>(
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
    ),
  );
}

export async function unifiedSearch(
  query: string,
  accountId?: string,
  limit = 50,
): Promise<UnifiedSearchResult[]> {
  const ftsQuery = query.trim();
  if (!ftsQuery) return [];

  // 1. Search messages via FTS5
  let results: UnifiedSearchResult[];
  if (accountId) {
    results = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'message' as type,
          m.id,
          COALESCE(m.subject, '(No subject)') as title,
          m.snippet,
          m.date,
          rank,
          m.account_id,
          json_object('from_name', m.from_name, 'from_address', m.from_address, 'thread_id', m.thread_id) as metadata
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         WHERE messages_fts MATCH $1 AND m.account_id = $2
         ORDER BY rank
         LIMIT $3`,
        [ftsQuery, accountId, Math.ceil(limit * 0.5)],
      ),
    );
  } else {
    results = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'message' as type,
          m.id,
          COALESCE(m.subject, '(No subject)') as title,
          m.snippet,
          m.date,
          rank,
          m.account_id,
          json_object('from_name', m.from_name, 'from_address', m.from_address, 'thread_id', m.thread_id) as metadata
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         WHERE messages_fts MATCH $1
         ORDER BY rank
         LIMIT $2`,
        [ftsQuery, Math.ceil(limit * 0.5)],
      ),
    );
  }

  // 2. Search vault files via contact_files_fts
  if (accountId) {
    const fileResults = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'file' as type,
          cf.id,
          COALESCE(cf.original_name, cf.filename) as title,
          null as snippet,
          cf.created_at as date,
          0 as rank,
          cf.account_id,
          json_object('category', cf.category, 'size', cf.size, 'mime_type', cf.mime_type, 'starred', cf.starred) as metadata
         FROM contact_files_fts fts
         JOIN contact_files cf ON cf.rowid = fts.rowid
         WHERE fts MATCH $1 AND cf.account_id = $2
         ORDER BY cf.created_at DESC
         LIMIT $3`,
        [ftsQuery, accountId, Math.ceil(limit * 0.25)],
      ),
    );
    results.push(...fileResults);
  } else {
    const fileResults = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'file' as type,
          cf.id,
          COALESCE(cf.original_name, cf.filename) as title,
          null as snippet,
          cf.created_at as date,
          0 as rank,
          cf.account_id,
          json_object('category', cf.category, 'size', cf.size, 'mime_type', cf.mime_type, 'starred', cf.starred) as metadata
         FROM contact_files_fts fts
         JOIN contact_files cf ON cf.rowid = fts.rowid
         WHERE fts MATCH $1
         ORDER BY cf.created_at DESC
         LIMIT $2`,
        [ftsQuery, Math.ceil(limit * 0.25)],
      ),
    );
    results.push(...fileResults);
  }

  // 3. Search tasks
  const taskPattern = `%${ftsQuery}%`;
  if (accountId) {
    const taskResults = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'task' as type,
          t.id,
          t.title,
          t.description as snippet,
          COALESCE(t.due_date, t.created_at) as date,
          0 as rank,
          t.account_id,
          json_object('is_completed', t.is_completed, 'priority', t.priority, 'due_date', t.due_date) as metadata
         FROM tasks t
         WHERE (t.title LIKE $1 OR t.description LIKE $1) AND t.account_id = $2
         ORDER BY date DESC
         LIMIT $3`,
        [taskPattern, accountId, Math.ceil(limit * 0.15)],
      ),
    );
    results.push(...taskResults);
  } else {
    const taskResults = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'task' as type,
          t.id,
          t.title,
          t.description as snippet,
          COALESCE(t.due_date, t.created_at) as date,
          0 as rank,
          t.account_id,
          json_object('is_completed', t.is_completed, 'priority', t.priority, 'due_date', t.due_date) as metadata
         FROM tasks t
         WHERE t.title LIKE $1 OR t.description LIKE $1
         ORDER BY date DESC
         LIMIT $2`,
        [taskPattern, Math.ceil(limit * 0.15)],
      ),
    );
    results.push(...taskResults);
  }

  // 4. Search contacts
  const contactPattern = `%${ftsQuery}%`;
  if (accountId) {
    const contactResults = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'contact' as type,
          c.id,
          COALESCE(c.display_name, c.email) as title,
          c.email as snippet,
          COALESCE(c.last_contacted_at, c.created_at) as date,
          0 as rank,
          null as account_id,
          json_object('email', c.email, 'display_name', c.display_name, 'frequency', c.frequency) as metadata
         FROM contacts c
         WHERE c.email LIKE $1 OR c.display_name LIKE $1
         ORDER BY c.frequency DESC
         LIMIT $2`,
        [contactPattern, Math.ceil(limit * 0.1)],
      ),
    );
    results.push(...contactResults);
  } else {
    const contactResults = await queryWithRetry(async (db) =>
      db.select<UnifiedSearchResult[]>(
        `SELECT
          'contact' as type,
          c.id,
          COALESCE(c.display_name, c.email) as title,
          c.email as snippet,
          COALESCE(c.last_contacted_at, c.created_at) as date,
          0 as rank,
          null as account_id,
          json_object('email', c.email, 'display_name', c.display_name, 'frequency', c.frequency) as metadata
         FROM contacts c
         WHERE c.email LIKE $1 OR c.display_name LIKE $1
         ORDER BY c.frequency DESC
         LIMIT $2`,
        [contactPattern, Math.ceil(limit * 0.1)],
      ),
    );
    results.push(...contactResults);
  }
  }

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

/**
 * Unified search across messages, vault files, tasks, and contacts.
 * Returns results ranked by FTS5 relevance.
 */
export async function unifiedSearch(
  query: string,
  accountId?: string,
  limit = 50,
): Promise<UnifiedSearchResult[]> {
  const db = await getDb();
  const ftsQuery = query.trim();
  if (!ftsQuery) return [];

  const results: UnifiedSearchResult[] = [];

  // 1. Search messages via FTS5
  if (accountId) {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'message' as type,
          m.id,
          COALESCE(m.subject, '(No subject)') as title,
          m.snippet,
          m.date,
          rank,
          m.account_id,
          json_object('from_name', m.from_name, 'from_address', m.from_address, 'thread_id', m.thread_id) as metadata
        FROM messages_fts
        JOIN messages m ON m.rowid = messages_fts.rowid
        WHERE messages_fts MATCH $1 AND m.account_id = $2
        ORDER BY rank
        LIMIT $3`,
        [ftsQuery, accountId, Math.ceil(limit * 0.5)],
      )),
    );
  } else {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'message' as type,
          m.id,
          COALESCE(m.subject, '(No subject)') as title,
          m.snippet,
          m.date,
          rank,
          m.account_id,
          json_object('from_name', m.from_name, 'from_address', m.from_address, 'thread_id', m.thread_id) as metadata
        FROM messages_fts
        JOIN messages m ON m.rowid = messages_fts.rowid
        WHERE messages_fts MATCH $1
        ORDER BY rank
        LIMIT $2`,
        [ftsQuery, Math.ceil(limit * 0.5)],
      )),
    );
  }

  // 2. Search vault files via contact_files_fts
  if (accountId) {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'file' as type,
          cf.id,
          COALESCE(cf.original_name, cf.filename) as title,
          null as snippet,
          cf.created_at as date,
          0 as rank,
          cf.account_id,
          json_object('category', cf.category, 'size', cf.size, 'mime_type', cf.mime_type, 'starred', cf.starred) as metadata
        FROM contact_files_fts fts
        JOIN contact_files cf ON cf.rowid = fts.rowid
        WHERE fts MATCH $1 AND cf.account_id = $2
        ORDER BY cf.created_at DESC
        LIMIT $3`,
        [ftsQuery, accountId, Math.ceil(limit * 0.25)],
      )),
    );
  } else {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'file' as type,
          cf.id,
          COALESCE(cf.original_name, cf.filename) as title,
          null as snippet,
          cf.created_at as date,
          0 as rank,
          cf.account_id,
          json_object('category', cf.category, 'size', cf.size, 'mime_type', cf.mime_type, 'starred', cf.starred) as metadata
        FROM contact_files_fts fts
        JOIN contact_files cf ON cf.rowid = fts.rowid
        WHERE fts MATCH $1
        ORDER BY cf.created_at DESC
        LIMIT $2`,
        [ftsQuery, Math.ceil(limit * 0.25)],
      )),
    );
  }

  // 3. Search tasks
  const taskPattern = `%${ftsQuery}%`;
  if (accountId) {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'task' as type,
          t.id,
          t.title,
          t.description as snippet,
          COALESCE(t.due_date, t.created_at) as date,
          0 as rank,
          t.account_id,
          json_object('is_completed', t.is_completed, 'priority', t.priority, 'due_date', t.due_date) as metadata
        FROM tasks t
        WHERE (t.title LIKE $1 OR t.description LIKE $1) AND t.account_id = $2
        ORDER BY date DESC
        LIMIT $3`,
        [taskPattern, accountId, Math.ceil(limit * 0.15)],
      )),
    );
  } else {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'task' as type,
          t.id,
          t.title,
          t.description as snippet,
          COALESCE(t.due_date, t.created_at) as date,
          0 as rank,
          t.account_id,
          json_object('is_completed', t.is_completed, 'priority', t.priority, 'due_date', t.due_date) as metadata
        FROM tasks t
        WHERE t.title LIKE $1 OR t.description LIKE $1
        ORDER BY date DESC
        LIMIT $2`,
        [taskPattern, Math.ceil(limit * 0.15)],
      )),
    );
  }

  // 4. Search contacts
  const contactPattern = `%${ftsQuery}%`;
  if (accountId) {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'contact' as type,
          c.id,
          COALESCE(c.display_name, c.email) as title,
          c.email as snippet,
          COALESCE(c.last_contacted_at, c.created_at) as date,
          0 as rank,
          null as account_id,
          json_object('email', c.email, 'display_name', c.display_name, 'frequency', c.frequency) as metadata
        FROM contacts c
        WHERE c.email LIKE $1 OR c.display_name LIKE $1
        ORDER BY c.frequency DESC
        LIMIT $2`,
        [contactPattern, Math.ceil(limit * 0.1)],
      )),
    );
  } else {
    results.push(
      ...(await db.select<UnifiedSearchResult[]>(
        `SELECT
          'contact' as type,
          c.id,
          COALESCE(c.display_name, c.email) as title,
          c.email as snippet,
          COALESCE(c.last_contacted_at, c.created_at) as date,
          0 as rank,
          null as account_id,
          json_object('email', c.email, 'display_name', c.display_name, 'frequency', c.frequency) as metadata
        FROM contacts c
        WHERE c.email LIKE $1 OR c.display_name LIKE $1
        ORDER BY c.frequency DESC
        LIMIT $2`,
        [contactPattern, Math.ceil(limit * 0.1)],
      )),
    );
  }

  // Sort by rank (messages first by FTS relevance), then date descending
  results.sort((a, b) => {
    if (a.type === "message" && b.type !== "message") return -1;
    if (a.type !== "message" && b.type === "message") return 1;
    return b.date - a.date;
  });

  return results.slice(0, limit);
}
