import { getDb } from "./connection";

export interface DbContact {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  frequency: number;
  last_contacted_at: number | null;
}

/**
 * Search contacts by email or name prefix for autocomplete.
 */
export async function searchContacts(
  query: string,
  limit = 10,
): Promise<DbContact[]> {
  const db = await getDb();
  const pattern = `%${query}%`;
  return db.select<DbContact[]>(
    `SELECT * FROM contacts
     WHERE email LIKE $1 OR display_name LIKE $1
     ORDER BY frequency DESC, display_name ASC
     LIMIT $2`,
    [pattern, limit],
  );
}

/**
 * Get all contacts, ordered by frequency descending.
 */
export async function getAllContacts(
  limit = 500,
  offset = 0,
): Promise<DbContact[]> {
  const db = await getDb();
  return db.select<DbContact[]>(
    `SELECT * FROM contacts
     ORDER BY frequency DESC, display_name ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
}

/**
 * Update a contact's display name.
 */
export async function updateContact(
  id: string,
  displayName: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE contacts SET display_name = $1, updated_at = unixepoch() WHERE id = $2`,
    [displayName, id],
  );
}

/**
 * Delete a contact by ID.
 */
export async function deleteContact(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM contacts WHERE id = $1", [id]);
}

/**
 * Upsert a contact — bumps frequency if already exists.
 */
export async function upsertContact(
  email: string,
  displayName: string | null,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO contacts (id, email, display_name, last_contacted_at)
     VALUES ($1, $2, $3, unixepoch())
     ON CONFLICT(email) DO UPDATE SET
       display_name = COALESCE($3, display_name),
       frequency = frequency + 1,
       last_contacted_at = unixepoch(),
       updated_at = unixepoch()`,
    [id, email.toLowerCase(), displayName],
  );
}

export async function getContactByEmail(
  email: string,
): Promise<DbContact | null> {
  const db = await getDb();
  const rows = await db.select<DbContact[]>(
    "SELECT * FROM contacts WHERE email = $1 LIMIT 1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

export interface ContactStats {
  emailCount: number;
  firstEmail: number | null;
  lastEmail: number | null;
}

export async function getContactStats(
  email: string,
): Promise<ContactStats> {
  const db = await getDb();
  const rows = await db.select<{ cnt: number; first_date: number | null; last_date: number | null }[]>(
    `SELECT COUNT(*) as cnt, MIN(date) as first_date, MAX(date) as last_date
     FROM messages WHERE from_address = $1`,
    [email.toLowerCase()],
  );
  const row = rows[0];
  return {
    emailCount: row?.cnt ?? 0,
    firstEmail: row?.first_date ?? null,
    lastEmail: row?.last_date ?? null,
  };
}

export async function getRecentThreadsWithContact(
  email: string,
  limit = 5,
): Promise<{ thread_id: string; subject: string | null; last_message_at: number | null }[]> {
  const db = await getDb();
  return db.select(
    `SELECT DISTINCT t.id as thread_id, t.subject, t.last_message_at
     FROM threads t
     INNER JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
     WHERE m.from_address = $1
     ORDER BY t.last_message_at DESC
     LIMIT $2`,
    [email.toLowerCase(), limit],
  );
}

export async function updateContactAvatar(
  email: string,
  avatarUrl: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE contacts SET avatar_url = $1, updated_at = unixepoch() WHERE email = $2",
    [avatarUrl, email.toLowerCase()],
  );
}
