import { queryWithRetry } from "./connection";

export interface QuickReply {
  id: string;
  account_id: string;
  title: string;
  body_html: string;
  shortcut: string | null;
  sort_order: number;
  usage_count: number;
  created_at: number;
}

export async function getQuickReplies(accountId: string): Promise<QuickReply[]> {
  return queryWithRetry(async (db) => {
    return db.select<QuickReply[]>(
      "SELECT * FROM quick_replies WHERE account_id = $1 ORDER BY sort_order, created_at",
      [accountId],
    );
  });
}

export async function upsertQuickReply(qr: {
  id?: string;
  accountId: string;
  title: string;
  bodyHtml: string;
  shortcut?: string | null;
  sortOrder?: number;
}): Promise<string> {
  const id = qr.id ?? crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO quick_replies (id, account_id, title, body_html, shortcut, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         body_html = excluded.body_html,
         shortcut = excluded.shortcut,
         sort_order = excluded.sort_order`,
      [id, qr.accountId, qr.title, qr.bodyHtml, qr.shortcut ?? null, qr.sortOrder ?? 0],
    );
  });
  return id;
}

export async function deleteQuickReply(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute("DELETE FROM quick_replies WHERE id = $1", [id]);
  });
}

export async function incrementQuickReplyUsage(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE quick_replies SET usage_count = usage_count + 1 WHERE id = $1",
      [id],
    );
  });
}
