import type { DbAccount } from "../db/accounts";
import type { ImapConfig, SmtpConfig } from "./tauriCommands";

/**
 * Map the DB-stored security value to the config type.
 * DB stores 'ssl' but the config type uses 'tls'.
 */
function mapSecurity(security: string | null): "tls" | "starttls" | "none" {
  if (!security) return "tls";
  const lower = security.toLowerCase();
  if (lower === "ssl" || lower === "tls") return "tls";
  if (lower === "starttls") return "starttls";
  if (lower === "none") return "none";
  return "tls";
}

/**
 * Map the DB auth_method value to config type.
 */
function mapAuthMethod(method: string | null): "password" | "oauth2" {
  if (method === "oauth2") return "oauth2";
  return "password";
}

/**
 * Build an ImapConfig from a DbAccount's IMAP fields.
 * Assumes the account's imap_password has already been decrypted.
 *
 * For OAuth2 accounts, pass a fresh `accessToken` obtained from
 * `ensureFreshToken()` — it will be used as the password field.
 */
export function buildImapConfig(
  account: DbAccount,
  accessToken?: string,
): ImapConfig {
  if (!account.imap_host) {
    throw new Error(`Account ${account.id} has no IMAP host configured`);
  }

  const authMethod = mapAuthMethod(account.auth_method);
  const password =
    authMethod === "oauth2" && accessToken
      ? accessToken
      : account.imap_password ?? "";

  return {
    host: account.imap_host,
    port: account.imap_port ?? 993,
    security: mapSecurity(account.imap_security),
    username: account.imap_username || account.email,
    password,
    auth_method: authMethod,
    accept_invalid_certs: !!account.accept_invalid_certs,
  };
}

/**
 * Build a SmtpConfig from a DbAccount's SMTP fields.
 * Assumes the account's imap_password has already been decrypted.
 *
 * For OAuth2 accounts, pass a fresh `accessToken` obtained from
 * `ensureFreshToken()` — it will be used as the password field.
 */
export function buildSmtpConfig(
  account: DbAccount,
  accessToken?: string,
): SmtpConfig {
  if (!account.smtp_host) {
    throw new Error(`Account ${account.id} has no SMTP host configured`);
  }

  const authMethod = mapAuthMethod(account.auth_method);
  const password =
    authMethod === "oauth2" && accessToken
      ? accessToken
      : account.imap_password ?? "";

  return {
    host: account.smtp_host,
    port: account.smtp_port ?? 587,
    security: mapSecurity(account.smtp_security),
    username: account.imap_username || account.email,
    password,
    auth_method: authMethod,
    accept_invalid_certs: !!account.accept_invalid_certs,
  };
}
