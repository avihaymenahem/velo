import { getDb } from "./connection";

export interface DbSendAsAlias {
  id: string;
  account_id: string;
  email: string;
  display_name: string | null;
  reply_to_address: string | null;
  signature_id: string | null;
  is_primary: number;
  is_default: number;
  treat_as_alias: number;
  verification_status: string;
  created_at: number;
}

export interface SendAsAlias {
  id: string;
  accountId: string;
  email: string;
  displayName: string | null;
  replyToAddress: string | null;
  signatureId: string | null;
  isPrimary: boolean;
  isDefault: boolean;
  treatAsAlias: boolean;
  verificationStatus: string;
}

export function mapDbAlias(db: DbSendAsAlias): SendAsAlias {
  return {
    id: db.id,
    accountId: db.account_id,
    email: db.email,
    displayName: db.display_name,
    replyToAddress: db.reply_to_address,
    signatureId: db.signature_id,
    isPrimary: db.is_primary === 1,
    isDefault: db.is_default === 1,
    treatAsAlias: db.treat_as_alias === 1,
    verificationStatus: db.verification_status,
  };
}

export async function getAliasesForAccount(
  accountId: string,
): Promise<DbSendAsAlias[]> {
  const db = await getDb();
  return db.select<DbSendAsAlias[]>(
    "SELECT * FROM send_as_aliases WHERE account_id = $1 ORDER BY is_primary DESC, email",
    [accountId],
  );
}

export async function upsertAlias(alias: {
  accountId: string;
  email: string;
  displayName?: string | null;
  replyToAddress?: string | null;
  signatureId?: string | null;
  isPrimary?: boolean;
  isDefault?: boolean;
  treatAsAlias?: boolean;
  verificationStatus?: string;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO send_as_aliases (id, account_id, email, display_name, reply_to_address, signature_id, is_primary, is_default, treat_as_alias, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(account_id, email) DO UPDATE SET
       display_name = excluded.display_name,
       reply_to_address = excluded.reply_to_address,
       signature_id = excluded.signature_id,
       is_primary = excluded.is_primary,
       treat_as_alias = excluded.treat_as_alias,
       verification_status = excluded.verification_status`,
    [
      id,
      alias.accountId,
      alias.email,
      alias.displayName ?? null,
      alias.replyToAddress ?? null,
      alias.signatureId ?? null,
      alias.isPrimary ? 1 : 0,
      alias.isDefault ? 1 : 0,
      alias.treatAsAlias !== false ? 1 : 0,
      alias.verificationStatus ?? "accepted",
    ],
  );

  return id;
}

export async function getDefaultAlias(
  accountId: string,
): Promise<DbSendAsAlias | null> {
  const db = await getDb();
  // Try to get the explicitly set default
  const defaults = await db.select<DbSendAsAlias[]>(
    "SELECT * FROM send_as_aliases WHERE account_id = $1 AND is_default = 1 LIMIT 1",
    [accountId],
  );
  if (defaults[0]) return defaults[0];

  // Fall back to the primary alias
  const primaries = await db.select<DbSendAsAlias[]>(
    "SELECT * FROM send_as_aliases WHERE account_id = $1 AND is_primary = 1 LIMIT 1",
    [accountId],
  );
  return primaries[0] ?? null;
}

export async function setDefaultAlias(
  accountId: string,
  aliasId: string,
): Promise<void> {
  const db = await getDb();
  // Clear all defaults for this account
  await db.execute(
    "UPDATE send_as_aliases SET is_default = 0 WHERE account_id = $1",
    [accountId],
  );
  // Set the specified alias as default
  await db.execute(
    "UPDATE send_as_aliases SET is_default = 1 WHERE id = $1 AND account_id = $2",
    [aliasId, accountId],
  );
}

export async function deleteAlias(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM send_as_aliases WHERE id = $1", [id]);
}
