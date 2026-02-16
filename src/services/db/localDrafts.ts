import { getDb } from "./connection";

export interface LocalDraft {
  id: string;
  account_id: string;
  to_addresses: string | null;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  subject: string | null;
  body_html: string | null;
  reply_to_message_id: string | null;
  thread_id: string | null;
  from_email: string | null;
  signature_id: string | null;
  remote_draft_id: string | null;
  attachments: string | null;
  created_at: number;
  updated_at: number;
  sync_status: string;
}

export async function upsertLocalDraft(draft: {
  id: string;
  account_id: string;
  to_addresses?: string | null;
  cc_addresses?: string | null;
  bcc_addresses?: string | null;
  subject?: string | null;
  body_html?: string | null;
  reply_to_message_id?: string | null;
  thread_id?: string | null;
  from_email?: string | null;
  signature_id?: string | null;
  remote_draft_id?: string | null;
  attachments?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO local_drafts (id, account_id, to_addresses, cc_addresses, bcc_addresses, subject, body_html, reply_to_message_id, thread_id, from_email, signature_id, remote_draft_id, attachments, updated_at, sync_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, unixepoch(), 'pending')
     ON CONFLICT(id) DO UPDATE SET
       to_addresses = $3, cc_addresses = $4, bcc_addresses = $5,
       subject = $6, body_html = $7, reply_to_message_id = $8,
       thread_id = $9, from_email = $10, signature_id = $11,
       remote_draft_id = $12, attachments = $13,
       updated_at = unixepoch(), sync_status = 'pending'`,
    [
      draft.id,
      draft.account_id,
      draft.to_addresses ?? null,
      draft.cc_addresses ?? null,
      draft.bcc_addresses ?? null,
      draft.subject ?? null,
      draft.body_html ?? null,
      draft.reply_to_message_id ?? null,
      draft.thread_id ?? null,
      draft.from_email ?? null,
      draft.signature_id ?? null,
      draft.remote_draft_id ?? null,
      draft.attachments ?? null,
    ],
  );
}

export async function getLocalDraft(id: string): Promise<LocalDraft | null> {
  const db = await getDb();
  const rows = await db.select<LocalDraft[]>(
    `SELECT * FROM local_drafts WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getUnsyncedDrafts(
  accountId: string,
): Promise<LocalDraft[]> {
  const db = await getDb();
  return db.select<LocalDraft[]>(
    `SELECT * FROM local_drafts WHERE account_id = $1 AND sync_status = 'pending' ORDER BY updated_at ASC`,
    [accountId],
  );
}

export async function markDraftSynced(
  id: string,
  remoteDraftId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE local_drafts SET sync_status = 'synced', remote_draft_id = $1 WHERE id = $2`,
    [remoteDraftId, id],
  );
}

export async function deleteLocalDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM local_drafts WHERE id = $1`, [id]);
}
