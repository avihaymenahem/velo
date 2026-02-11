import { getDb } from "./connection";

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
  const now = Math.floor(Date.now() / 1000);
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
