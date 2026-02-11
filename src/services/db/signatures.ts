import { getDb, buildDynamicUpdate } from "./connection";

export interface DbSignature {
  id: string;
  account_id: string;
  name: string;
  body_html: string;
  is_default: number;
  sort_order: number;
}

export async function getSignaturesForAccount(
  accountId: string,
): Promise<DbSignature[]> {
  const db = await getDb();
  return db.select<DbSignature[]>(
    "SELECT * FROM signatures WHERE account_id = $1 ORDER BY sort_order, created_at",
    [accountId],
  );
}

export async function getDefaultSignature(
  accountId: string,
): Promise<DbSignature | null> {
  const db = await getDb();
  const rows = await db.select<DbSignature[]>(
    "SELECT * FROM signatures WHERE account_id = $1 AND is_default = 1 LIMIT 1",
    [accountId],
  );
  return rows[0] ?? null;
}

export async function insertSignature(sig: {
  accountId: string;
  name: string;
  bodyHtml: string;
  isDefault: boolean;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();

  // If setting as default, unset others first
  if (sig.isDefault) {
    await db.execute(
      "UPDATE signatures SET is_default = 0 WHERE account_id = $1",
      [sig.accountId],
    );
  }

  await db.execute(
    "INSERT INTO signatures (id, account_id, name, body_html, is_default) VALUES ($1, $2, $3, $4, $5)",
    [id, sig.accountId, sig.name, sig.bodyHtml, sig.isDefault ? 1 : 0],
  );
  return id;
}

export async function updateSignature(
  id: string,
  updates: { name?: string; bodyHtml?: string; isDefault?: boolean },
): Promise<void> {
  const db = await getDb();

  if (updates.isDefault) {
    // Get the account_id first
    const rows = await db.select<{ account_id: string }[]>(
      "SELECT account_id FROM signatures WHERE id = $1",
      [id],
    );
    if (rows[0]) {
      await db.execute(
        "UPDATE signatures SET is_default = 0 WHERE account_id = $1",
        [rows[0].account_id],
      );
    }
  }

  const fields: [string, unknown][] = [];
  if (updates.name !== undefined) fields.push(["name", updates.name]);
  if (updates.bodyHtml !== undefined) fields.push(["body_html", updates.bodyHtml]);
  if (updates.isDefault !== undefined) fields.push(["is_default", updates.isDefault ? 1 : 0]);

  const query = buildDynamicUpdate("signatures", "id", id, fields);
  if (query) {
    await db.execute(query.sql, query.params);
  }
}

export async function deleteSignature(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM signatures WHERE id = $1", [id]);
}
