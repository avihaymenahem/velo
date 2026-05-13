import { queryWithRetry, selectFirstBy } from "./connection";
import { normalizeEmail } from "@/utils/emailUtils";

export interface DbContact {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  frequency: number;
  last_contacted_at: number | null;
  notes: string | null;
}

export interface ContactAttachment {
  filename: string;
  mime_type: string | null;
  size: number | null;
  date: number;
}

export interface SameDomainContact {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Search contacts by email or name prefix for autocomplete.
 */
export async function searchContacts(
  query: string,
  limit = 10,
): Promise<DbContact[]> {
  return queryWithRetry(async (db) => {
    const pattern = `%${query}%`;
    return db.select<DbContact[]>(
      `SELECT * FROM contacts
       WHERE email LIKE $1 OR display_name LIKE $1
       ORDER BY frequency DESC, display_name ASC
       LIMIT $2`,
      [pattern, limit],
    );
  });
}

/**
 * Get all contacts, ordered by frequency descending.
 */
export async function getAllContacts(
  limit = 500,
  offset = 0,
): Promise<DbContact[]> {
  return queryWithRetry(async (db) =>
    db.select<DbContact[]>(
      `SELECT * FROM contacts
       ORDER BY frequency DESC, display_name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
  );
}

/**
 * Update a contact's display name.
 */
export async function updateContact(
  id: string,
  displayName: string | null,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      `UPDATE contacts SET display_name = $1, updated_at = unixepoch() WHERE id = $2`,
      [displayName, id],
    );
  });
}

/**
 * Delete a contact by ID.
 */
export async function deleteContact(id: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute("DELETE FROM contacts WHERE id = $1", [id]);
  });
}

/**
 * Upsert a contact — bumps frequency if already exists.
 */
export async function upsertContact(
  email: string,
  displayName: string | null,
): Promise<void> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO contacts (id, email, display_name, last_contacted_at)
       VALUES ($1, $2, $3, unixepoch())
       ON CONFLICT(email) DO UPDATE SET
         display_name = COALESCE($3, display_name),
         frequency = frequency + 1,
         last_contacted_at = unixepoch(),
         updated_at = unixepoch()`,
      [id, normalizeEmail(email), displayName],
    );
  });
}

export async function getContactById(
  id: string,
): Promise<DbContact | null> {
  return selectFirstBy<DbContact>(
    "SELECT * FROM contacts WHERE id = $1 LIMIT 1",
    [id],
  );
}

export async function getContactByEmail(
  email: string,
): Promise<DbContact | null> {
  return selectFirstBy<DbContact>(
    "SELECT * FROM contacts WHERE email = $1 LIMIT 1",
    [normalizeEmail(email)],
  );
}

export interface ContactStats {
  emailCount: number;
  firstEmail: number | null;
  lastEmail: number | null;
}

export async function getContactStats(
  email: string,
): Promise<ContactStats> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ cnt: number; first_date: number | null; last_date: number | null }[]>(
      `SELECT COUNT(*) as cnt, MIN(date) as first_date, MAX(date) as last_date
       FROM messages WHERE from_address = $1`,
      [normalizeEmail(email)],
    );
    const row = rows[0];
    return {
      emailCount: row?.cnt ?? 0,
      firstEmail: row?.first_date ?? null,
      lastEmail: row?.last_date ?? null,
    };
  });
}

export async function getRecentThreadsWithContact(
  email: string,
  limit = 5,
): Promise<{ thread_id: string; subject: string | null; last_message_at: number | null }[]> {
  return queryWithRetry(async (db) =>
    db.select(
      `SELECT DISTINCT t.id as thread_id, t.subject, t.last_message_at
       FROM threads t
       INNER JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       WHERE m.from_address = $1
       ORDER BY t.last_message_at DESC
       LIMIT $2`,
      [normalizeEmail(email), limit],
    )
  );
}

export async function updateContactAvatar(
  email: string,
  avatarUrl: string,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE contacts SET avatar_url = $1, updated_at = unixepoch() WHERE email = $2",
      [avatarUrl, normalizeEmail(email)],
    );
  });
}

/**
 * Update a contact's notes by email.
 */
export async function updateContactNotes(
  email: string,
  notes: string | null,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE contacts SET notes = $1, updated_at = unixepoch() WHERE email = $2",
      [notes || null, normalizeEmail(email)],
    );
  });
}

/**
 * Get recent non-inline attachments from a contact.
 */
export async function getAttachmentsFromContact(
  email: string,
  limit = 5,
): Promise<ContactAttachment[]> {
  return queryWithRetry(async (db) =>
    db.select<ContactAttachment[]>(
      `SELECT a.filename, a.mime_type, a.size, m.date
       FROM attachments a
       INNER JOIN messages m ON m.account_id = a.account_id AND m.id = a.message_id
       WHERE m.from_address = $1 AND a.is_inline = 0 AND a.filename IS NOT NULL
       ORDER BY m.date DESC
       LIMIT $2`,
      [normalizeEmail(email), limit],
    )
  );
}

const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
  "live.com", "yahoo.com", "yahoo.co.uk", "aol.com", "icloud.com",
  "me.com", "mac.com", "protonmail.com", "proton.me", "mail.com",
  "zoho.com", "yandex.com", "gmx.com", "gmx.net",
]);

/**
 * Get other contacts from the same email domain (e.g., colleagues).
 * Skips public email providers.
 */
export async function getContactsFromSameDomain(
  email: string,
  limit = 5,
): Promise<SameDomainContact[]> {
  const normalized = normalizeEmail(email);
  const atIdx = normalized.indexOf("@");
  if (atIdx === -1) return [];

  const domain = normalized.slice(atIdx + 1);
  if (PUBLIC_DOMAINS.has(domain)) return [];

  return queryWithRetry(async (db) =>
    db.select<SameDomainContact[]>(
      `SELECT email, display_name, avatar_url FROM contacts
       WHERE email LIKE $1 AND email != $2
       ORDER BY frequency DESC
       LIMIT $3`,
      [`%@${domain}`, normalized, limit],
    )
  );
}

/**
 * Get the most recent auth_results JSON string for messages from this sender.
 */
export async function getLatestAuthResult(
  email: string,
): Promise<string | null> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ auth_results: string | null }[]>(
      `SELECT auth_results FROM messages
       WHERE from_address = $1 AND auth_results IS NOT NULL
       ORDER BY date DESC LIMIT 1`,
      [normalizeEmail(email)],
    );
    return rows[0]?.auth_results ?? null;
  });
}

export interface ContactEngagementRow {
  id: string;
  email: string;
  engagement_score: number;
  last_engaged_at: number | null;
  health_status: string;
}

export async function getContactEngagementData(contactId: string): Promise<ContactEngagementRow | null> {
  return selectFirstBy<ContactEngagementRow>(
    "SELECT id, email, engagement_score, last_engaged_at, health_status FROM contacts WHERE id = $1",
    [contactId],
  );
}

export async function updateContactScore(
  contactId: string,
  score: number,
  lastEngagedAt: number,
  healthStatus: string,
): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      `UPDATE contacts SET engagement_score = $1, last_engaged_at = $2, health_status = $3, updated_at = unixepoch() WHERE id = $4`,
      [score, lastEngagedAt, healthStatus, contactId],
    );
  });
}

export async function getContactsNeedingScoreUpdate(hours = 24): Promise<{ id: string; email: string }[]> {
  const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
  return queryWithRetry(async (db) =>
    db.select<{ id: string; email: string }[]>(
      `SELECT id, email FROM contacts
       WHERE updated_at IS NULL OR updated_at < $1
       ORDER BY updated_at ASC NULLS FIRST
       LIMIT 500`,
      [cutoff],
    )
  );
}

export interface EngagementLogRow {
  id: string;
  contact_id: string;
  event_type: string;
  score_delta: number;
  created_at: number;
}

export async function insertEngagementLog(
  contactId: string,
  eventType: string,
  scoreDelta: number,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO engagement_log (id, contact_id, event_type, score_delta, created_at) VALUES ($1, $2, $3, $4, $5)",
      [id, contactId, eventType, scoreDelta, now],
    );
  });
}

export async function getEngagementLog(
  contactId: string,
  limit = 50,
): Promise<EngagementLogRow[]> {
  return queryWithRetry(async (db) =>
    db.select<EngagementLogRow[]>(
      "SELECT * FROM engagement_log WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2",
      [contactId, limit],
    )
  );
}

export interface DynamicSegmentRow {
  id: string;
  account_id: string;
  name: string;
  query: string;
  refreshed_at: number | null;
}

export async function getDynamicSegments(accountId: string): Promise<DynamicSegmentRow[]> {
  return queryWithRetry(async (db) =>
    db.select<DynamicSegmentRow[]>(
      "SELECT * FROM dynamic_segments WHERE account_id = $1 ORDER BY name ASC",
      [accountId],
    )
  );
}

export async function createDynamicSegment(
  accountId: string,
  name: string,
  query: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO dynamic_segments (id, account_id, name, query) VALUES ($1, $2, $3, $4)",
      [id, accountId, name, query],
    );
  });
  return id;
}

export async function updateDynamicSegmentRefresh(segmentId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE dynamic_segments SET refreshed_at = $1 WHERE id = $2",
      [now, segmentId],
    );
  });
}

export async function deleteDynamicSegment(id: string, accountId: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "DELETE FROM dynamic_segments WHERE id = $1 AND account_id = $2",
      [id, accountId],
    );
  });
}
