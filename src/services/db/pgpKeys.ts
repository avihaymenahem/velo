import { getDb } from "./connection";

export interface DbPgpKey {
  id: string;
  account_id: string;
  key_id: string;
  public_key: string;
  private_key_encrypted: string | null;
  passphrase_hint: string | null;
  fingerprint: string | null;
  created_at: number;
}

export async function getPgpKeys(accountId: string): Promise<DbPgpKey[]> {
  const db = await getDb();
  return db.select<DbPgpKey[]>(
    "SELECT * FROM pgp_keys WHERE account_id = $1 ORDER BY created_at DESC",
    [accountId],
  );
}

export async function savePgpKey(
  accountId: string,
  keyId: string,
  publicKey: string,
  privateKeyEncrypted?: string,
  passphraseHint?: string,
  fingerprint?: string,
): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO pgp_keys (id, account_id, key_id, public_key, private_key_encrypted, passphrase_hint, fingerprint)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      accountId,
      keyId,
      publicKey,
      privateKeyEncrypted ?? null,
      passphraseHint ?? null,
      fingerprint ?? null,
    ],
  );
  return id;
}

export async function deletePgpKey(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM pgp_keys WHERE id = $1", [id]);
}

export async function getPgpKey(
  accountId: string,
): Promise<{ private_key_encrypted: string } | null> {
  const db = await getDb();
  const rows = await db.select<{ private_key_encrypted: string }[]>(
    "SELECT private_key_encrypted FROM pgp_keys WHERE account_id = $1 AND private_key_encrypted IS NOT NULL LIMIT 1",
    [accountId],
  );
  return rows[0] ?? null;
}
