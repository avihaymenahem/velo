import { getDb, buildDynamicUpdate } from "./connection";

export interface DbTemplate {
  id: string;
  account_id: string | null;
  name: string;
  subject: string | null;
  body_html: string;
  shortcut: string | null;
  sort_order: number;
  created_at: number;
}

/**
 * Get all templates for an account (includes global templates where account_id IS NULL).
 */
export async function getTemplatesForAccount(
  accountId: string,
): Promise<DbTemplate[]> {
  const db = await getDb();
  return db.select<DbTemplate[]>(
    "SELECT * FROM templates WHERE account_id = $1 OR account_id IS NULL ORDER BY sort_order, created_at",
    [accountId],
  );
}

export async function insertTemplate(tmpl: {
  accountId: string | null;
  name: string;
  subject: string | null;
  bodyHtml: string;
  shortcut: string | null;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT INTO templates (id, account_id, name, subject, body_html, shortcut) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, tmpl.accountId, tmpl.name, tmpl.subject, tmpl.bodyHtml, tmpl.shortcut],
  );
  return id;
}

export async function updateTemplate(
  id: string,
  updates: { name?: string; subject?: string | null; bodyHtml?: string; shortcut?: string | null },
): Promise<void> {
  const db = await getDb();
  const fields: [string, unknown][] = [];
  if (updates.name !== undefined) fields.push(["name", updates.name]);
  if (updates.subject !== undefined) fields.push(["subject", updates.subject]);
  if (updates.bodyHtml !== undefined) fields.push(["body_html", updates.bodyHtml]);
  if (updates.shortcut !== undefined) fields.push(["shortcut", updates.shortcut]);

  const query = buildDynamicUpdate("templates", "id", id, fields);
  if (query) {
    await db.execute(query.sql, query.params);
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM templates WHERE id = $1", [id]);
}
