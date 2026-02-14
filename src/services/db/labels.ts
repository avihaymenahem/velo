import { getDb } from "./connection";

export interface DbLabel {
  id: string;
  account_id: string;
  name: string;
  type: string;
  color_bg: string | null;
  color_fg: string | null;
  visible: number;
  sort_order: number;
  imap_folder_path: string | null;
  imap_special_use: string | null;
}

export async function getLabelsForAccount(
  accountId: string,
): Promise<DbLabel[]> {
  const db = await getDb();
  return db.select<DbLabel[]>(
    "SELECT * FROM labels WHERE account_id = $1 ORDER BY sort_order ASC, name ASC",
    [accountId],
  );
}

export async function upsertLabel(label: {
  id: string;
  accountId: string;
  name: string;
  type: string;
  colorBg?: string | null;
  colorFg?: string | null;
  imapFolderPath?: string | null;
  imapSpecialUse?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO labels (id, account_id, name, type, color_bg, color_fg, imap_folder_path, imap_special_use)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(account_id, id) DO UPDATE SET
       name = $3, type = $4, color_bg = $5, color_fg = $6,
       imap_folder_path = COALESCE($7, imap_folder_path),
       imap_special_use = COALESCE($8, imap_special_use)`,
    [
      label.id,
      label.accountId,
      label.name,
      label.type,
      label.colorBg ?? null,
      label.colorFg ?? null,
      label.imapFolderPath ?? null,
      label.imapSpecialUse ?? null,
    ],
  );
}

export async function deleteLabelsForAccount(
  accountId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM labels WHERE account_id = $1", [accountId]);
}

export async function deleteLabel(
  accountId: string,
  labelId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM labels WHERE account_id = $1 AND id = $2",
    [accountId, labelId],
  );
}

export async function updateLabelSortOrder(
  accountId: string,
  labelOrders: { id: string; sortOrder: number }[],
): Promise<void> {
  const db = await getDb();
  for (const { id, sortOrder } of labelOrders) {
    await db.execute(
      "UPDATE labels SET sort_order = $1 WHERE account_id = $2 AND id = $3",
      [sortOrder, accountId, id],
    );
  }
}
