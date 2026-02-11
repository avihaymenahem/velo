import { getDb } from "./connection";
import { encryptValue, decryptValue, isEncrypted } from "@/utils/crypto";

export interface DbAccount {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: number | null;
  history_id: string | null;
  last_sync_at: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

async function decryptAccountTokens(account: DbAccount): Promise<DbAccount> {
  if (account.access_token && isEncrypted(account.access_token)) {
    try {
      account.access_token = await decryptValue(account.access_token);
    } catch (err) {
      console.warn("Failed to decrypt access token, using raw value:", err);
    }
  }
  if (account.refresh_token && isEncrypted(account.refresh_token)) {
    try {
      account.refresh_token = await decryptValue(account.refresh_token);
    } catch (err) {
      console.warn("Failed to decrypt refresh token, using raw value:", err);
    }
  }
  return account;
}

export async function getAllAccounts(): Promise<DbAccount[]> {
  const db = await getDb();
  const accounts = await db.select<DbAccount[]>(
    "SELECT * FROM accounts ORDER BY created_at ASC",
  );
  return Promise.all(accounts.map(decryptAccountTokens));
}

export async function getAccount(id: string): Promise<DbAccount | null> {
  const db = await getDb();
  const rows = await db.select<DbAccount[]>(
    "SELECT * FROM accounts WHERE id = $1",
    [id],
  );
  const account = rows[0] ?? null;
  return account ? decryptAccountTokens(account) : null;
}

export async function getAccountByEmail(
  email: string,
): Promise<DbAccount | null> {
  const db = await getDb();
  const rows = await db.select<DbAccount[]>(
    "SELECT * FROM accounts WHERE email = $1",
    [email],
  );
  const account = rows[0] ?? null;
  return account ? decryptAccountTokens(account) : null;
}

export async function insertAccount(account: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
}): Promise<void> {
  const db = await getDb();
  const encAccessToken = await encryptValue(account.accessToken);
  const encRefreshToken = await encryptValue(account.refreshToken);
  await db.execute(
    `INSERT INTO accounts (id, email, display_name, avatar_url, access_token, refresh_token, token_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      account.id,
      account.email,
      account.displayName,
      account.avatarUrl,
      encAccessToken,
      encRefreshToken,
      account.tokenExpiresAt,
    ],
  );
}

export async function updateAccountTokens(
  id: string,
  accessToken: string,
  tokenExpiresAt: number,
): Promise<void> {
  const db = await getDb();
  const encAccessToken = await encryptValue(accessToken);
  await db.execute(
    "UPDATE accounts SET access_token = $1, token_expires_at = $2, updated_at = unixepoch() WHERE id = $3",
    [encAccessToken, tokenExpiresAt, id],
  );
}

export async function updateAccountSyncState(
  id: string,
  historyId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE accounts SET history_id = $1, last_sync_at = unixepoch(), updated_at = unixepoch() WHERE id = $2",
    [historyId, id],
  );
}

export async function clearAccountHistoryId(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE accounts SET history_id = NULL, updated_at = unixepoch() WHERE id = $1",
    [id],
  );
}

export async function updateAccountAllTokens(
  id: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiresAt: number,
): Promise<void> {
  const db = await getDb();
  const encAccessToken = await encryptValue(accessToken);
  const encRefreshToken = await encryptValue(refreshToken);
  await db.execute(
    "UPDATE accounts SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = unixepoch() WHERE id = $4",
    [encAccessToken, encRefreshToken, tokenExpiresAt, id],
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}
