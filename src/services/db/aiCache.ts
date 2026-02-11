import { getDb } from "./connection";

interface AiCacheEntry {
  id: string;
  account_id: string;
  thread_id: string;
  type: string;
  content: string;
  created_at: number;
}

export async function getAiCache(
  accountId: string,
  threadId: string,
  type: string,
): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<AiCacheEntry[]>(
    "SELECT content FROM ai_cache WHERE account_id = $1 AND thread_id = $2 AND type = $3",
    [accountId, threadId, type],
  );
  return rows[0]?.content ?? null;
}

export async function setAiCache(
  accountId: string,
  threadId: string,
  type: string,
  content: string,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO ai_cache (id, account_id, thread_id, type, content)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(account_id, thread_id, type) DO UPDATE SET
       content = $5, created_at = unixepoch()`,
    [id, accountId, threadId, type, content],
  );
}

export async function deleteAiCache(
  accountId: string,
  threadId: string,
  type: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM ai_cache WHERE account_id = $1 AND thread_id = $2 AND type = $3",
    [accountId, threadId, type],
  );
}
