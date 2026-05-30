import { getDb } from "./connection";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";

export interface DbScheduledEmail {
  id: string;
  account_id: string;
  to_addresses: string;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  subject: string | null;
  body_html: string;
  reply_to_message_id: string | null;
  thread_id: string | null;
  scheduled_at: number;
  signature_id: string | null;
  attachment_paths: string | null;
  status: string;
  created_at: number;
}

export async function getPendingScheduledEmails(): Promise<DbScheduledEmail[]> {
  const db = await getDb();
  const now = getCurrentUnixTimestamp();
  return db.select<DbScheduledEmail[]>(
    "SELECT * FROM scheduled_emails WHERE status = 'pending' AND scheduled_at <= $1 ORDER BY scheduled_at ASC",
    [now],
  );
}

export async function getScheduledEmailsForAccount(
  accountId: string,
): Promise<DbScheduledEmail[]> {
  const db = await getDb();
  return db.select<DbScheduledEmail[]>(
    "SELECT * FROM scheduled_emails WHERE account_id = $1 AND status = 'pending' ORDER BY scheduled_at ASC",
    [accountId],
  );
}

export async function insertScheduledEmail(email: {
  accountId: string;
  toAddresses: string;
  ccAddresses: string | null;
  bccAddresses: string | null;
  subject: string | null;
  bodyHtml: string;
  replyToMessageId: string | null;
  threadId: string | null;
  scheduledAt: number;
  signatureId: string | null;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO scheduled_emails (id, account_id, to_addresses, cc_addresses, bcc_addresses, subject, body_html, reply_to_message_id, thread_id, scheduled_at, signature_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      email.accountId,
      email.toAddresses,
      email.ccAddresses,
      email.bccAddresses,
      email.subject,
      email.bodyHtml,
      email.replyToMessageId,
      email.threadId,
      email.scheduledAt,
      email.signatureId,
    ],
  );
  return id;
}

export async function updateScheduledEmailStatus(
  id: string,
  status: "pending" | "sending" | "sent" | "failed" | "cancelled",
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE scheduled_emails SET status = $1 WHERE id = $2",
    [status, id],
  );
}

export async function deleteScheduledEmail(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM scheduled_emails WHERE id = $1", [id]);
}

export async function getScheduledCountsByAccounts(
  accountIds: string[],
): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ account_id: string; cnt: number }[]>(
    `SELECT account_id, COUNT(*) as cnt FROM scheduled_emails WHERE account_id IN (${placeholders}) AND status = 'pending' GROUP BY account_id`,
    accountIds,
  );
  const result: Record<string, number> = {};
  for (const row of rows) result[row.account_id] = Number(row.cnt);
  return result;
}

export async function getScheduledEmailsByAccounts(
  accountIds: string[],
): Promise<DbScheduledEmail[]> {
  if (accountIds.length === 0) return [];
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
  return db.select<DbScheduledEmail[]>(
    `SELECT * FROM scheduled_emails WHERE account_id IN (${placeholders}) AND status = 'pending' ORDER BY scheduled_at ASC`,
    accountIds,
  );
}

export async function updateScheduledTime(id: string, scheduledAt: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE scheduled_emails SET scheduled_at = $1 WHERE id = $2",
    [scheduledAt, id],
  );
}
