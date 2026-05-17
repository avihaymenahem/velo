import { getDb, selectFirstBy, boolToInt } from "./connection";

export interface DbSignature {
  id: string;
  account_id: string;
  group_id: string | null;
  name: string;
  body_html: string;
  is_default: number;
  sort_order: number;
  created_at: number;
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

/**
 * Return one representative signature per group that is NOT yet active for
 * the given account — these are signatures from other accounts that can be
 * imported/activated.
 */
export async function getAvailableSignaturesForAccount(
  accountId: string,
): Promise<DbSignature[]> {
  const db = await getDb();

  // Compute active group IDs in JS to avoid SQL alias quirks in the Tauri plugin
  const activeSigs = await db.select<DbSignature[]>(
    "SELECT * FROM signatures WHERE account_id = $1",
    [accountId],
  );
  const activeGroupIds = new Set(activeSigs.map((s) => s.group_id ?? s.id));

  // All signatures belonging to other accounts
  const others = await db.select<DbSignature[]>(
    "SELECT * FROM signatures WHERE account_id != $1 ORDER BY name",
    [accountId],
  );

  // Deduplicate by group — keep only one representative per group not already active
  const seen = new Set<string>();
  const available: DbSignature[] = [];
  for (const sig of others) {
    const gid = sig.group_id ?? sig.id;
    if (!activeGroupIds.has(gid) && !seen.has(gid)) {
      seen.add(gid);
      available.push(sig);
    }
  }
  return available;
}

/**
 * Get all signatures across all accounts that belong to the same group.
 */
export async function getSignaturesByGroupId(
  groupId: string,
): Promise<DbSignature[]> {
  const db = await getDb();
  return db.select<DbSignature[]>(
    "SELECT * FROM signatures WHERE group_id = $1",
    [groupId],
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

/**
 * Insert a new signature. If it's a new "master" signature, group_id = id.
 */
export async function insertSignature(sig: {
  accountId: string;
  name: string;
  bodyHtml: string;
  isDefault: boolean;
  groupId?: string; // If provided, this is a clone of another signature
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const groupId = sig.groupId ?? id; // If no groupId, this is the master

  // If setting as default, unset others first
  if (sig.isDefault) {
    await db.execute(
      "UPDATE signatures SET is_default = 0 WHERE account_id = $1",
      [sig.accountId],
    );
  }

  await db.execute(
    "INSERT INTO signatures (id, account_id, group_id, name, body_html, is_default) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, sig.accountId, groupId, sig.name, sig.bodyHtml, boolToInt(sig.isDefault)],
  );
  return id;
}

/**
 * Clone (import) a signature for a different account.
 * Creates a new record with the same group_id but different account_id.
 */
export async function importSignature(
  sourceId: string,
  targetAccountId: string,
): Promise<string> {
  const db = await getDb();

  // Get source signature
  const source = await selectFirstBy<DbSignature>(
    "SELECT * FROM signatures WHERE id = $1",
    [sourceId],
  );
  if (!source) throw new Error("Source signature not found");

  const sourceGroupId = source.group_id ?? source.id;

  // Check if already imported for this account
  const existing = await db.select<DbSignature[]>(
    "SELECT id FROM signatures WHERE group_id = $1 AND account_id = $2",
    [sourceGroupId, targetAccountId],
  );
  if (existing.length > 0 && existing[0]) {
    return existing[0].id; // Already imported
  }

  return insertSignature({
    accountId: targetAccountId,
    name: source.name,
    bodyHtml: source.body_html,
    isDefault: false,
    groupId: sourceGroupId,
  });
}

/**
 * Update a signature. If it belongs to a group, update ALL signatures in that group.
 */
export async function updateSignature(
  id: string,
  updates: { name?: string; bodyHtml?: string; isDefault?: boolean },
): Promise<void> {
  const db = await getDb();

  // Get current signature to find its group
  const current = await selectFirstBy<DbSignature>(
    "SELECT * FROM signatures WHERE id = $1",
    [id],
  );
  if (!current) return;

  const groupId = current.group_id ?? current.id;

  // If setting as default, unset others in the same account first
  if (updates.isDefault === true) {
    await db.execute(
      "UPDATE signatures SET is_default = 0 WHERE account_id = $1",
      [current.account_id],
    );
  }

  // Update all signatures in the group
  if (updates.name !== undefined) {
    await db.execute(
      "UPDATE signatures SET name = $1 WHERE group_id = $2 OR id = $2",
      [updates.name, groupId],
    );
  }
  if (updates.bodyHtml !== undefined) {
    await db.execute(
      "UPDATE signatures SET body_html = $1 WHERE group_id = $2 OR id = $2",
      [updates.bodyHtml, groupId],
    );
  }
  // Always update is_default when provided (true or false)
  if (updates.isDefault !== undefined) {
    await db.execute(
      "UPDATE signatures SET is_default = $1 WHERE group_id = $2 OR id = $2",
      [boolToInt(updates.isDefault), groupId],
    );
  }
}

/**
 * Delete a signature.
 * - If it's part of a group with multiple signatures: delete only this record (disable for this account).
 * - If it's the only one in the group: delete all records in the group (definitive).
 */
export async function deleteSignature(id: string): Promise<void> {
  const db = await getDb();

  // Get current signature to find its group
  const current = await selectFirstBy<DbSignature>(
    "SELECT * FROM signatures WHERE id = $1",
    [id],
  );
  if (!current) return;

  const groupId = current.group_id ?? current.id;

  // Count how many signatures are in this group
  const countRows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM signatures WHERE group_id = $1 OR id = $1",
    [groupId],
  );
  const count = countRows[0]?.count ?? 0;

  if (count > 1) {
    // Multiple signatures in group: only delete this one (disable for this account)
    await db.execute("DELETE FROM signatures WHERE id = $1", [id]);
  } else {
    // Only one signature: delete all in group (definitive)
    await db.execute("DELETE FROM signatures WHERE group_id = $1 OR id = $1", [groupId]);
  }
}
