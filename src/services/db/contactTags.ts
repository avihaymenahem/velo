import { queryWithRetry } from "./connection";

export interface DbContactTag {
  id: string;
  account_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: number;
}

export interface DbContactTagPivot {
  contact_id: string;
  tag_id: string;
}

export async function getContactTags(accountId: string): Promise<DbContactTag[]> {
  return queryWithRetry(async (db) =>
    db.select<DbContactTag[]>(
      "SELECT * FROM contact_tags WHERE account_id = $1 ORDER BY sort_order ASC, name ASC",
      [accountId],
    ),
  );
}

export async function getContactTagById(id: string): Promise<DbContactTag | null> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<DbContactTag[]>(
      "SELECT * FROM contact_tags WHERE id = $1",
      [id],
    );
    return rows[0] ?? null;
  });
}

export async function upsertContactTag(
  id: string | undefined,
  accountId: string,
  name: string,
  color?: string | null,
): Promise<string> {
  return queryWithRetry(async (db) => {
    const tagId = id ?? crypto.randomUUID();
    await db.execute(
      `INSERT INTO contact_tags (id, account_id, name, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(account_id, name) DO UPDATE SET color = $4`,
      [tagId, accountId, name, color ?? null],
    );
    return tagId;
  });
}

export async function deleteContactTag(id: string, accountId: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute(
      "DELETE FROM contact_tags WHERE id = $1 AND account_id = $2",
      [id, accountId],
    ),
  );
}

export async function getContactCountForTag(tagId: string): Promise<number> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM contact_tag_pivot WHERE tag_id = $1",
      [tagId],
    );
    return rows[0]?.count ?? 0;
  });
}

export async function addTagToContact(contactId: string, tagId: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute(
      "INSERT OR IGNORE INTO contact_tag_pivot (contact_id, tag_id) VALUES ($1, $2)",
      [contactId, tagId],
    ),
  );
}

export async function removeTagFromContact(contactId: string, tagId: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute(
      "DELETE FROM contact_tag_pivot WHERE contact_id = $1 AND tag_id = $2",
      [contactId, tagId],
    ),
  );
}

export async function getTagIdsForContact(contactId: string): Promise<string[]> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<DbContactTagPivot[]>(
      "SELECT tag_id FROM contact_tag_pivot WHERE contact_id = $1",
      [contactId],
    );
    return rows.map((r) => r.tag_id);
  });
}
