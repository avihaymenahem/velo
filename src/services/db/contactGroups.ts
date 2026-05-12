import { queryWithRetry } from "./connection";

export interface DbContactGroup {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  created_at: number;
}

export interface DbContactGroupPivot {
  contact_id: string;
  group_id: string;
}

export async function getContactGroups(accountId: string): Promise<DbContactGroup[]> {
  return queryWithRetry(async (db) =>
    db.select<DbContactGroup[]>(
      "SELECT * FROM contact_groups WHERE account_id = $1 ORDER BY name ASC",
      [accountId],
    )
  );
}

export async function upsertContactGroup(
  id: string | undefined,
  accountId: string,
  name: string,
  description?: string | null,
): Promise<string> {
  const groupId = id ?? crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO contact_groups (id, account_id, name, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(account_id, name) DO UPDATE SET description = $4`,
      [groupId, accountId, name, description ?? null],
    );
  });
  return groupId;
}

export async function deleteContactGroup(id: string, accountId: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "DELETE FROM contact_groups WHERE id = $1 AND account_id = $2",
      [id, accountId],
    );
  });
}

export async function getContactCountForGroup(groupId: string): Promise<number> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM contact_group_pivot WHERE group_id = $1",
      [groupId],
    );
    return rows[0]?.count ?? 0;
  });
}

export async function addContactToGroup(contactId: string, groupId: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT OR IGNORE INTO contact_group_pivot (contact_id, group_id) VALUES ($1, $2)",
      [contactId, groupId],
    );
  });
}

export async function removeContactFromGroup(contactId: string, groupId: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute(
      "DELETE FROM contact_group_pivot WHERE contact_id = $1 AND group_id = $2",
      [contactId, groupId],
    );
  });
}

export async function getContactGroupIds(groupId: string): Promise<{ contact_id: string }[]> {
  return queryWithRetry(async (db) =>
    db.select<{ contact_id: string }[]>(
      "SELECT contact_id FROM contact_group_pivot WHERE group_id = $1",
      [groupId],
    )
  );
}
