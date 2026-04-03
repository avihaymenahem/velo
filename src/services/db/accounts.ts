import { getDb, selectFirstBy } from "./connection";
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
  provider: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_security: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_security: string | null;
  auth_method: string;
  imap_password: string | null;
  oauth_provider: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  imap_username: string | null;
  caldav_url: string | null;
  caldav_username: string | null;
  caldav_password: string | null;
  caldav_principal_url: string | null;
  caldav_home_url: string | null;
  calendar_provider: string | null;
  accept_invalid_certs: number;
}

async function decryptField(value: string, fieldName: string): Promise<string> {
  if (!isEncrypted(value)) {
    // Non-encrypted value — treat as legacy plaintext that needs re-encryption
    console.warn(`[accounts] Unencrypted ${fieldName} detected — will be re-encrypted on next token refresh or account update`);
    return value;
  }
  try {
    return await decryptValue(value);
  } catch (err) {
    // Decryption failed — do NOT fall back to raw value (could be tampered)
    const reason = err instanceof Error ? err.message : "unknown error";
    throw new Error(`Failed to decrypt ${fieldName}: credential may be corrupted or tampered (${reason})`);
  }
}

async function decryptAccountTokens(account: DbAccount): Promise<DbAccount> {
  if (account.access_token) {
    account.access_token = await decryptField(account.access_token, "access_token");
  }
  if (account.refresh_token) {
    account.refresh_token = await decryptField(account.refresh_token, "refresh_token");
  }
  if (account.imap_password) {
    account.imap_password = await decryptField(account.imap_password, "imap_password");
  }
  if (account.oauth_client_secret) {
    account.oauth_client_secret = await decryptField(account.oauth_client_secret, "oauth_client_secret");
  }
  if (account.caldav_password) {
    account.caldav_password = await decryptField(account.caldav_password, "caldav_password");
  }
  return account;
}

export async function getAllAccounts(): Promise<DbAccount[]> {
  const db = await getDb();
  const accounts = await db.select<DbAccount[]>(
    "SELECT * FROM accounts ORDER BY created_at ASC",
  );
  const results = await Promise.allSettled(accounts.map(decryptAccountTokens));
  const loaded: DbAccount[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      loaded.push(result.value);
    } else {
      console.error("[accounts] Skipping account with corrupted credentials:", result.reason);
    }
  }
  return loaded;
}

export async function getAccount(id: string): Promise<DbAccount | null> {
  const account = await selectFirstBy<DbAccount>(
    "SELECT * FROM accounts WHERE id = $1",
    [id],
  );
  return account ? decryptAccountTokens(account) : null;
}

export async function getAccountByEmail(
  email: string,
): Promise<DbAccount | null> {
  const account = await selectFirstBy<DbAccount>(
    "SELECT * FROM accounts WHERE email = $1",
    [email],
  );
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

export async function insertImapAccount(account: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  authMethod: string;
  password: string;
  imapUsername?: string | null;
  acceptInvalidCerts?: boolean;
}): Promise<void> {
  const db = await getDb();
  const encPassword = await encryptValue(account.password);
  await db.execute(
    `INSERT INTO accounts (id, email, display_name, avatar_url, access_token, refresh_token, provider, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, auth_method, imap_password, imap_username, accept_invalid_certs)
     VALUES ($1, $2, $3, $4, NULL, NULL, 'imap', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      account.id,
      account.email,
      account.displayName,
      account.avatarUrl,
      account.imapHost,
      account.imapPort,
      account.imapSecurity,
      account.smtpHost,
      account.smtpPort,
      account.smtpSecurity,
      account.authMethod,
      encPassword,
      account.imapUsername || null,
      account.acceptInvalidCerts ? 1 : 0,
    ],
  );
}

export async function insertCalDavAccount(account: {
  id: string;
  email: string;
  displayName: string | null;
  caldavUrl: string;
  caldavUsername: string;
  caldavPassword: string;
  caldavPrincipalUrl?: string | null;
  caldavHomeUrl?: string | null;
}): Promise<void> {
  const db = await getDb();
  const encPassword = await encryptValue(account.caldavPassword);
  await db.execute(
    `INSERT INTO accounts (id, email, display_name, avatar_url, access_token, refresh_token, provider, calendar_provider, caldav_url, caldav_username, caldav_password, caldav_principal_url, caldav_home_url)
     VALUES ($1, $2, $3, NULL, NULL, NULL, 'caldav', 'caldav', $4, $5, $6, $7, $8)`,
    [
      account.id,
      account.email,
      account.displayName,
      account.caldavUrl,
      account.caldavUsername,
      encPassword,
      account.caldavPrincipalUrl ?? null,
      account.caldavHomeUrl ?? null,
    ],
  );
}

export async function updateAccountCalDav(
  accountId: string,
  fields: {
    caldavUrl: string;
    caldavUsername: string;
    caldavPassword: string;
    caldavPrincipalUrl?: string | null;
    caldavHomeUrl?: string | null;
    calendarProvider: string;
  },
): Promise<void> {
  const db = await getDb();
  const encPassword = await encryptValue(fields.caldavPassword);
  await db.execute(
    `UPDATE accounts SET caldav_url = $1, caldav_username = $2, caldav_password = $3,
       caldav_principal_url = $4, caldav_home_url = $5, calendar_provider = $6,
       updated_at = unixepoch() WHERE id = $7`,
    [
      fields.caldavUrl,
      fields.caldavUsername,
      encPassword,
      fields.caldavPrincipalUrl ?? null,
      fields.caldavHomeUrl ?? null,
      fields.calendarProvider,
      accountId,
    ],
  );
}

export async function insertOAuthImapAccount(account: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  oauthProvider: string;
  oauthClientId: string;
  oauthClientSecret: string | null;
  imapUsername?: string | null;
  acceptInvalidCerts?: boolean;
}): Promise<void> {
  const db = await getDb();
  const encAccessToken = await encryptValue(account.accessToken);
  const encRefreshToken = await encryptValue(account.refreshToken);
  const encClientSecret = account.oauthClientSecret
    ? await encryptValue(account.oauthClientSecret)
    : null;
  await db.execute(
    `INSERT INTO accounts (id, email, display_name, avatar_url, access_token, refresh_token, token_expires_at, provider, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, auth_method, imap_password, oauth_provider, oauth_client_id, oauth_client_secret, imap_username, accept_invalid_certs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'imap', $8, $9, $10, $11, $12, $13, 'oauth2', NULL, $14, $15, $16, $17, $18)`,
    [
      account.id,
      account.email,
      account.displayName,
      account.avatarUrl,
      encAccessToken,
      encRefreshToken,
      account.tokenExpiresAt,
      account.imapHost,
      account.imapPort,
      account.imapSecurity,
      account.smtpHost,
      account.smtpPort,
      account.smtpSecurity,
      account.oauthProvider,
      account.oauthClientId,
      encClientSecret,
      account.imapUsername || null,
      account.acceptInvalidCerts ? 1 : 0,
    ],
  );
}
