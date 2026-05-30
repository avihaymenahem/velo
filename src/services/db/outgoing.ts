import { getDb } from "./connection";
import { parseRawEmail } from "@/utils/rawEmailParser";

export interface OutgoingDbEmail {
  id: string;
  accountId: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  threadId: string | null;
  inReplyTo: string | null;
  raw: string;
  status: "pending" | "failed";
  createdAt: number;
  retryCount: number;
  errorMessage: string | null;
}

interface PendingRow {
  id: string;
  account_id: string;
  params: string;
  status: string;
  created_at: number;
  retry_count: number;
  error_message: string | null;
}

export async function getOutgoingDbEmails(accountIds?: string[]): Promise<OutgoingDbEmail[]> {
  const db = await getDb();
  let rows: PendingRow[];

  if (accountIds && accountIds.length > 0) {
    const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
    rows = await db.select<PendingRow[]>(
      `SELECT id, account_id, params, status, created_at, retry_count, error_message
       FROM pending_operations
       WHERE operation_type = 'sendMessage'
         AND status IN ('pending', 'failed')
         AND account_id IN (${placeholders})
       ORDER BY created_at ASC`,
      accountIds,
    );
  } else {
    rows = await db.select<PendingRow[]>(
      `SELECT id, account_id, params, status, created_at, retry_count, error_message
       FROM pending_operations
       WHERE operation_type = 'sendMessage'
         AND status IN ('pending', 'failed')
       ORDER BY created_at ASC`,
    );
  }

  return rows.map((row) => {
    const params = JSON.parse(row.params) as { rawBase64Url: string; threadId?: string };
    const parsed = parseRawEmail(params.rawBase64Url);
    return {
      id: row.id,
      accountId: row.account_id,
      to: parsed.to,
      cc: parsed.cc,
      subject: parsed.subject,
      bodyHtml: parsed.bodyHtml,
      threadId: params.threadId ?? null,
      inReplyTo: parsed.inReplyTo,
      raw: params.rawBase64Url,
      status: row.status as "pending" | "failed",
      createdAt: row.created_at,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
    };
  });
}

export async function getOutgoingDbCountByAccount(
  accountIds: string[],
): Promise<Record<string, number>> {
  if (accountIds.length === 0) return {};
  const db = await getDb();
  const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<{ account_id: string; cnt: number }[]>(
    `SELECT account_id, COUNT(*) as cnt
     FROM pending_operations
     WHERE operation_type = 'sendMessage'
       AND status IN ('pending', 'failed')
       AND account_id IN (${placeholders})
     GROUP BY account_id`,
    accountIds,
  );
  const result: Record<string, number> = {};
  for (const row of rows) result[row.account_id] = row.cnt;
  return result;
}

export async function getOutgoingDbTotalCount(accountIds?: string[]): Promise<number> {
  const db = await getDb();
  if (accountIds && accountIds.length > 0) {
    const placeholders = accountIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await db.select<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM pending_operations
       WHERE operation_type = 'sendMessage'
         AND status IN ('pending', 'failed')
         AND account_id IN (${placeholders})`,
      accountIds,
    );
    return rows[0]?.cnt ?? 0;
  }
  const rows = await db.select<{ cnt: number }[]>(
    `SELECT COUNT(*) as cnt FROM pending_operations
     WHERE operation_type = 'sendMessage' AND status IN ('pending', 'failed')`,
  );
  return rows[0]?.cnt ?? 0;
}
