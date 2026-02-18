import { getDb } from "./connection";

export interface DbWritingStyleProfile {
  id: string;
  account_id: string;
  profile_text: string;
  sample_count: number;
  created_at: number;
  updated_at: number;
}

export async function getWritingStyleProfile(
  accountId: string,
): Promise<DbWritingStyleProfile | null> {
  const db = await getDb();
  const rows = await db.select<DbWritingStyleProfile[]>(
    "SELECT * FROM writing_style_profiles WHERE account_id = $1",
    [accountId],
  );
  return rows[0] ?? null;
}

export async function upsertWritingStyleProfile(
  accountId: string,
  profileText: string,
  sampleCount: number,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO writing_style_profiles (id, account_id, profile_text, sample_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(account_id) DO UPDATE SET
       profile_text = $3, sample_count = $4, updated_at = unixepoch()`,
    [id, accountId, profileText, sampleCount],
  );
}

export async function deleteWritingStyleProfile(
  accountId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM writing_style_profiles WHERE account_id = $1",
    [accountId],
  );
}
