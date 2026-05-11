import { getDb } from "./connection";

export interface DbContactSegment {
  id: string;
  account_id: string;
  name: string;
  query: string;
  created_at: number;
}

export async function getContactSegments(accountId: string): Promise<DbContactSegment[]> {
  const db = await getDb();
  return db.select<DbContactSegment[]>(
    "SELECT * FROM contact_segments WHERE account_id = $1 ORDER BY name ASC",
    [accountId],
  );
}

export async function upsertContactSegment(
  id: string | undefined,
  accountId: string,
  name: string,
  query: string,
): Promise<string> {
  const db = await getDb();
  const segmentId = id ?? crypto.randomUUID();
  await db.execute(
    `INSERT INTO contact_segments (id, account_id, name, query)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(account_id, name) DO UPDATE SET query = $4`,
    [segmentId, accountId, name, query],
  );
  return segmentId;
}

export async function deleteContactSegment(id: string, accountId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM contact_segments WHERE id = $1 AND account_id = $2",
    [id, accountId],
  );
}
