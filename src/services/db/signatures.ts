import { queryWithRetry, buildDynamicUpdate, selectFirstBy, boolToInt } from "./connection";

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
  return queryWithRetry(async (db) =>
    db.select<DbSignature[]>(
      "SELECT * FROM signatures WHERE account_id = $1 ORDER BY sort_order, created_at",
      [accountId],
    ),
  );
}

export async function getDefaultSignature(
  accountId: string,
): Promise<DbSignature | null> {
  return selectFirstBy<DbSignature>(
    "SELECT * FROM signatures WHERE account_id = $1 AND is_default = 1 LIMIT 1",
    [accountId],
  );
}

export async function insertSignature(sig: {
  accountId: string;
  name: string;
  bodyHtml: string;
  isDefault: boolean;
}): Promise<string> {
  const id = crypto.randomUUID();

  await queryWithRetry(async (db) => {
    if (sig.isDefault) {
      await db.execute(
        "UPDATE signatures SET is_default = 0 WHERE account_id = $1",
        [sig.accountId],
      );
    }

    await db.execute(
      "INSERT INTO signatures (id, account_id, name, body_html, is_default) VALUES ($1, $2, $3, $4, $5)",
      [id, sig.accountId, sig.name, sig.bodyHtml, boolToInt(sig.isDefault)],
    );
  });
  return id;
}

export async function updateSignature(
  id: string,
  updates: { name?: string; bodyHtml?: string; isDefault?: boolean },
): Promise<void> {
  await queryWithRetry(async (db) => {
    if (updates.isDefault) {
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
    if (updates.isDefault !== undefined) fields.push(["is_default", boolToInt(updates.isDefault)]);

    const query = buildDynamicUpdate("signatures", "id", id, fields);
    if (query) {
      await db.execute(query.sql, query.params);
    }
  });
}

export async function deleteSignature(id: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute("DELETE FROM signatures WHERE id = $1", [id]),
  );
}
