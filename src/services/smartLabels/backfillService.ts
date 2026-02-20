import { getDb } from "@/services/db/connection";
import { matchSmartLabels } from "./smartLabelService";
import { addThreadLabel } from "@/services/emailActions";
import type { ParsedMessage } from "@/services/gmail/messageParser";

interface BackfillRow {
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  from_address: string | null;
  from_name: string | null;
  body_text: string | null;
  body_html: string | null;
  to_addresses: string | null;
  has_attachments: number;
  id: string;
}

/**
 * Apply smart labels to existing inbox threads in batches.
 * Returns the total number of labels applied.
 */
export async function backfillSmartLabels(
  accountId: string,
  batchSize = 50,
): Promise<number> {
  const db = await getDb();
  let totalLabeled = 0;
  let offset = 0;

  while (true) {
    // Fetch inbox threads with their latest message data
    const rows = await db.select<BackfillRow[]>(
      `SELECT t.id AS thread_id, t.subject, t.snippet,
              m.from_address, m.from_name, m.body_text, m.body_html,
              m.to_addresses, m.has_attachments, m.id
       FROM threads t
       INNER JOIN thread_labels tl ON tl.account_id = t.account_id AND tl.thread_id = t.id
       LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
         AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
       WHERE t.account_id = $1 AND tl.label_id = 'INBOX'
       ORDER BY t.last_message_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, batchSize, offset],
    );

    if (rows.length === 0) break;

    // Build lightweight ParsedMessage objects from DB rows
    const messages: ParsedMessage[] = rows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      fromAddress: row.from_address,
      fromName: row.from_name,
      toAddresses: row.to_addresses,
      ccAddresses: null,
      bccAddresses: null,
      replyTo: null,
      subject: row.subject,
      snippet: row.snippet ?? "",
      date: 0,
      isRead: false,
      isStarred: false,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      rawSize: 0,
      internalDate: 0,
      labelIds: [],
      hasAttachments: row.has_attachments === 1,
      attachments: [],
      listUnsubscribe: null,
      listUnsubscribePost: null,
      authResults: null,
    }));

    const matches = await matchSmartLabels(accountId, messages);

    await Promise.allSettled(
      matches.flatMap(({ threadId, labelIds }) =>
        labelIds.map((labelId) =>
          addThreadLabel(accountId, threadId, labelId).catch((err) => {
            console.error(`Backfill: failed to apply label ${labelId} to ${threadId}:`, err);
          }),
        ),
      ),
    );

    for (const match of matches) {
      totalLabeled += match.labelIds.length;
    }

    offset += batchSize;

    // If we got fewer than batchSize, we've reached the end
    if (rows.length < batchSize) break;
  }

  return totalLabeled;
}
