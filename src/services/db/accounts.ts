import { getDb, selectFirstBy, withTransaction } from "./connection";
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
  smtp_username: string | null;
  smtp_password: string | null;
  caldav_url: string | null;
  caldav_username: string | null;
  caldav_password: string | null;
  caldav_principal_url: string | null;
  caldav_home_url: string | null;
  calendar_provider: string | null;
  accept_invalid_certs: number;
  rag_enabled: number;
  color: string | null;
  include_in_global: number;
  sort_order: number;
  label: string | null;
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
  if (account.imap_password && isEncrypted(account.imap_password)) {
    try {
      account.imap_password = await decryptValue(account.imap_password);
    } catch (err) {
      console.warn("Failed to decrypt IMAP password, using raw value:", err);
    }
  }
  if (account.smtp_password && isEncrypted(account.smtp_password)) {
    try {
      account.smtp_password = await decryptValue(account.smtp_password);
    } catch (err) {
      console.warn("Failed to decrypt SMTP password, using raw value:", err);
    }
  }
  if (account.oauth_client_secret && isEncrypted(account.oauth_client_secret)) {
    try {
      account.oauth_client_secret = await decryptValue(account.oauth_client_secret);
    } catch (err) {
      console.warn("Failed to decrypt OAuth client secret, using raw value:", err);
    }
  }
  if (account.caldav_password && isEncrypted(account.caldav_password)) {
    try {
      account.caldav_password = await decryptValue(account.caldav_password);
    } catch (err) {
      console.warn("Failed to decrypt CalDAV password, using raw value:", err);
    }
  }
  return account;
}

export async function getAllAccounts(): Promise<DbAccount[]> {
  const db = await getDb();
  let accounts: DbAccount[];
  try {
    accounts = await db.select<DbAccount[]>(
      "SELECT * FROM accounts ORDER BY sort_order ASC, email ASC",
    );
  } catch {
    // sort_order column may not exist yet if migration v41 hasn't run
    accounts = await db.select<DbAccount[]>(
      "SELECT * FROM accounts ORDER BY email ASC",
    );
  }
  return Promise.all(accounts.map(decryptAccountTokens));
}

export async function updateAccountMeta(
  accountId: string,
  fields: {
    color?: string | null;
    includeInGlobal?: boolean;
    sortOrder?: number;
    displayName?: string | null;
    label?: string | null;
  },
): Promise<void> {
  const db = await getDb();
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if ("color" in fields) {
    params.push(fields.color ?? null);
    setClauses.push(`color = $${params.length}`);
  }
  if ("includeInGlobal" in fields) {
    params.push(fields.includeInGlobal ? 1 : 0);
    setClauses.push(`include_in_global = $${params.length}`);
  }
  if ("sortOrder" in fields) {
    params.push(fields.sortOrder);
    setClauses.push(`sort_order = $${params.length}`);
  }
  if ("displayName" in fields) {
    params.push(fields.displayName ?? null);
    setClauses.push(`display_name = $${params.length}`);
  }
  if ("label" in fields) {
    params.push(fields.label ?? null);
    setClauses.push(`label = $${params.length}`);
  }
  if (setClauses.length === 0) return;

  setClauses.push("updated_at = unixepoch()");
  params.push(accountId);
  await db.execute(
    `UPDATE accounts SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
    params,
  );
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
  const encAccessToken = await encryptValue(accessToken);
  await withTransaction(async (db) => {
    await db.execute(
      "UPDATE accounts SET access_token = $1, token_expires_at = $2, updated_at = unixepoch() WHERE id = $3",
      [encAccessToken, tokenExpiresAt, id],
    );
  });
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
  const encAccessToken = await encryptValue(accessToken);
  const encRefreshToken = await encryptValue(refreshToken);
  await withTransaction(async (db) => {
    await db.execute(
      "UPDATE accounts SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = unixepoch() WHERE id = $4",
      [encAccessToken, encRefreshToken, tokenExpiresAt, id],
    );
  });
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
  smtpPassword?: string | null;
  smtpUsername?: string | null;
  imapUsername?: string | null;
  acceptInvalidCerts?: boolean;
}): Promise<void> {
  const db = await getDb();
  const encPassword = await encryptValue(account.password);
  const encSmtpPassword =
    account.smtpPassword ? await encryptValue(account.smtpPassword) : null;
  await db.execute(
    `INSERT INTO accounts (id, email, display_name, avatar_url, access_token, refresh_token, provider, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security, auth_method, imap_password, smtp_password, smtp_username, imap_username, accept_invalid_certs)
     VALUES ($1, $2, $3, $4, NULL, NULL, 'imap', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
      encSmtpPassword,
      account.smtpUsername || null,
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

export async function updateImapAccount(
  accountId: string,
  fields: {
    displayName: string | null;
    imapHost: string;
    imapPort: number;
    imapSecurity: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: string;
    imapUsername: string | null;
    /** If null, keep the existing password unchanged */
    newPassword: string | null;
    /** If null, keep the existing SMTP password unchanged */
    newSmtpPassword: string | null;
    /** True = use same password as IMAP (set smtp_password to NULL) */
    smtpSameAsImap: boolean;
    acceptInvalidCerts: boolean;
  },
): Promise<void> {
  const db = await getDb();
  const encPassword = fields.newPassword != null
    ? await encryptValue(fields.newPassword)
    : null;
  const encSmtpPassword = fields.smtpSameAsImap
    ? null
    : fields.newSmtpPassword != null
      ? await encryptValue(fields.newSmtpPassword)
      : null;

  const params: unknown[] = [
    fields.displayName,
    fields.imapHost,
    fields.imapPort,
    fields.imapSecurity,
    fields.smtpHost,
    fields.smtpPort,
    fields.smtpSecurity,
    fields.imapUsername || null,
    fields.acceptInvalidCerts ? 1 : 0,
  ];

  let passwordClauses = "";
  if (fields.newPassword != null) {
    params.push(encPassword);
    passwordClauses += `, imap_password = $${params.length}`;
  }
  if (fields.smtpSameAsImap) {
    passwordClauses += ", smtp_password = NULL";
  } else if (fields.newSmtpPassword != null) {
    params.push(encSmtpPassword);
    passwordClauses += `, smtp_password = $${params.length}`;
  }

  params.push(accountId);
  const idParam = `$${params.length}`;

  await db.execute(
    `UPDATE accounts SET
       display_name = $1,
       imap_host = $2,
       imap_port = $3,
       imap_security = $4,
       smtp_host = $5,
       smtp_port = $6,
       smtp_security = $7,
       imap_username = $8,
       accept_invalid_certs = $9
       ${passwordClauses},
       updated_at = unixepoch()
     WHERE id = ${idParam}`,
    params,
  );
}

export async function getAccountRagEnabled(accountId: string): Promise<boolean> {
  const db = await getDb();
  type Row = { rag_enabled: number };
  const [row] = await db.select<Row[]>(
    "SELECT rag_enabled FROM accounts WHERE id = $1",
    [accountId],
  );
  return (row?.rag_enabled ?? 0) === 1;
}

export async function setAccountRagEnabled(accountId: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE accounts SET rag_enabled = $1 WHERE id = $2",
    [enabled ? 1 : 0, accountId],
  );
}
