import { getDb } from "./connection";

export interface DbFollowUpReminder {
  id: string;
  account_id: string;
  thread_id: string;
  message_id: string;
  remind_at: number;
  status: string;
  created_at: number;
}

export async function insertFollowUpReminder(
  accountId: string,
  threadId: string,
  messageId: string,
  remindAt: number,
): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO follow_up_reminders (id, account_id, thread_id, message_id, remind_at, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT(account_id, thread_id) DO UPDATE SET
       message_id = $4, remind_at = $5, status = 'pending'`,
    [id, accountId, threadId, messageId, remindAt],
  );
}

export async function getPendingFollowUpReminders(): Promise<DbFollowUpReminder[]> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  return db.select<DbFollowUpReminder[]>(
    "SELECT * FROM follow_up_reminders WHERE status = 'pending' AND remind_at <= $1",
    [now],
  );
}

export async function getFollowUpForThread(
  accountId: string,
  threadId: string,
): Promise<DbFollowUpReminder | null> {
  const db = await getDb();
  const rows = await db.select<DbFollowUpReminder[]>(
    "SELECT * FROM follow_up_reminders WHERE account_id = $1 AND thread_id = $2 AND status = 'pending' LIMIT 1",
    [accountId, threadId],
  );
  return rows[0] ?? null;
}

export async function updateFollowUpStatus(
  id: string,
  status: "triggered" | "cancelled",
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE follow_up_reminders SET status = $1 WHERE id = $2",
    [status, id],
  );
}

export async function cancelFollowUpForThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE follow_up_reminders SET status = 'cancelled' WHERE account_id = $1 AND thread_id = $2 AND status = 'pending'",
    [accountId, threadId],
  );
}

export async function getActiveFollowUpThreadIds(
  accountId: string,
  threadIds: string[],
): Promise<Set<string>> {
  if (threadIds.length === 0) return new Set();
  const db = await getDb();
  const placeholders = threadIds.map((_, i) => `$${i + 2}`).join(",");
  const rows = await db.select<{ thread_id: string }[]>(
    `SELECT thread_id FROM follow_up_reminders WHERE account_id = $1 AND status = 'pending' AND thread_id IN (${placeholders})`,
    [accountId, ...threadIds],
  );
  return new Set(rows.map((r) => r.thread_id));
}
