import { getDb, queryWithRetry, buildDynamicUpdate } from "./connection";

export interface DbTemplate {
  id: string;
  account_id: string | null;
  name: string;
  subject: string | null;
  body_html: string;
  shortcut: string | null;
  sort_order: number;
  created_at: number;
  category_id: string | null;
  is_favorite: number;
  usage_count: number;
  last_used_at: number | null;
  conditional_blocks_json: string | null;
}

export interface DbTemplateCategory {
  id: string;
  account_id: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  is_system: number;
}

export async function getTemplatesForAccount(
  accountId: string,
): Promise<DbTemplate[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbTemplate[]>(
      "SELECT * FROM templates WHERE account_id = $1 OR account_id IS NULL ORDER BY sort_order, created_at",
      [accountId],
    );
  });
}

export async function insertTemplate(tmpl: {
  accountId: string | null;
  name: string;
  subject: string | null;
  bodyHtml: string;
  shortcut: string | null;
  categoryId?: string | null;
  conditionalBlocksJson?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO templates (id, account_id, name, subject, body_html, shortcut, category_id, conditional_blocks_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [id, tmpl.accountId, tmpl.name, tmpl.subject, tmpl.bodyHtml, tmpl.shortcut, tmpl.categoryId ?? null, tmpl.conditionalBlocksJson ?? null],
    );
  });
  return id;
}

export async function updateTemplate(
  id: string,
  updates: { name?: string; subject?: string | null; bodyHtml?: string; shortcut?: string | null; categoryId?: string | null; isFavorite?: boolean; conditionalBlocksJson?: string | null },
): Promise<void> {
  const fields: [string, unknown][] = [];
  if (updates.name !== undefined) fields.push(["name", updates.name]);
  if (updates.subject !== undefined) fields.push(["subject", updates.subject]);
  if (updates.bodyHtml !== undefined) fields.push(["body_html", updates.bodyHtml]);
  if (updates.shortcut !== undefined) fields.push(["shortcut", updates.shortcut]);
  if (updates.categoryId !== undefined) fields.push(["category_id", updates.categoryId]);
  if (updates.isFavorite !== undefined) fields.push(["is_favorite", updates.isFavorite ? 1 : 0]);
  if (updates.conditionalBlocksJson !== undefined) fields.push(["conditional_blocks_json", updates.conditionalBlocksJson]);

  await queryWithRetry(async (db) => {
    const query = buildDynamicUpdate("templates", "id", id, fields);
    if (query) {
      await db.execute(query.sql, query.params);
    }
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute("DELETE FROM templates WHERE id = $1", [id]);
  });
}

export async function incrementTemplateUsage(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE templates SET usage_count = usage_count + 1, last_used_at = unixepoch() WHERE id = $1",
      [id],
    );
  });
}

export async function getFavorites(accountId: string): Promise<DbTemplate[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbTemplate[]>(
      "SELECT * FROM templates WHERE (account_id = $1 OR account_id IS NULL) AND is_favorite = 1 ORDER BY last_used_at DESC, name",
      [accountId],
    );
  });
}

export async function getMostUsed(accountId: string, limit = 5): Promise<DbTemplate[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbTemplate[]>(
      "SELECT * FROM templates WHERE (account_id = $1 OR account_id IS NULL) AND usage_count > 0 ORDER BY usage_count DESC, last_used_at DESC LIMIT $2",
      [accountId, limit],
    );
  });
}

export async function getCategories(accountId: string): Promise<DbTemplateCategory[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbTemplateCategory[]>(
      "SELECT * FROM template_categories WHERE account_id = $1 OR account_id IS NULL ORDER BY sort_order, name",
      [accountId],
    );
  });
}

export async function upsertCategory(cat: {
  id?: string;
  accountId: string | null;
  name: string;
  icon?: string | null;
}): Promise<string> {
  const id = cat.id ?? crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO template_categories (id, account_id, name, icon)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(id) DO UPDATE SET name = $3, icon = COALESCE($4, icon)`,
      [id, cat.accountId, cat.name, cat.icon ?? null],
    );
  });
  return id;
}

export async function deleteCategory(id: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute("DELETE FROM template_categories WHERE id = $1", [id]);
    await db.execute("UPDATE templates SET category_id = NULL WHERE category_id = $1", [id]);
  });
}
