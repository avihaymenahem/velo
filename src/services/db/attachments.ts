import { getDb } from "./connection";

export interface DbAttachment {
  id: string;
  message_id: string;
  account_id: string;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
  gmail_attachment_id: string | null;
  content_id: string | null;
  is_inline: number;
  local_path: string | null;
}

export async function upsertAttachment(att: {
  id: string;
  messageId: string;
  accountId: string;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  gmailAttachmentId: string | null;
  contentId: string | null;
  isInline: boolean;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO attachments (id, message_id, account_id, filename, mime_type, size, gmail_attachment_id, content_id, is_inline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       filename = $4, mime_type = $5, size = $6,
       gmail_attachment_id = $7, content_id = $8, is_inline = $9`,
    [
      att.id,
      att.messageId,
      att.accountId,
      att.filename,
      att.mimeType,
      att.size,
      att.gmailAttachmentId,
      att.contentId,
      att.isInline ? 1 : 0,
    ],
  );
}

export async function getAttachmentsForMessage(
  accountId: string,
  messageId: string,
): Promise<DbAttachment[]> {
  const db = await getDb();
  return db.select<DbAttachment[]>(
    "SELECT * FROM attachments WHERE account_id = $1 AND message_id = $2 ORDER BY filename ASC",
    [accountId, messageId],
  );
}
