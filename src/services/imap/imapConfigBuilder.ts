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
 */
export function buildImapConfig(account: DbAccount): ImapConfig {
  if (!account.imap_host) {
    throw new Error(`Account ${account.id} has no IMAP host configured`);
  }

  return {
    host: account.imap_host,
    port: account.imap_port ?? 993,
    security: mapSecurity(account.imap_security),
    username: account.email,
    password: account.imap_password ?? "",
    auth_method: mapAuthMethod(account.auth_method),
  };
}

/**
 * Build a SmtpConfig from a DbAccount's SMTP fields.
 * Assumes the account's imap_password has already been decrypted.
 */
export function buildSmtpConfig(account: DbAccount): SmtpConfig {
  if (!account.smtp_host) {
    throw new Error(`Account ${account.id} has no SMTP host configured`);
  }

  return {
    host: account.smtp_host,
    port: account.smtp_port ?? 587,
    security: mapSecurity(account.smtp_security),
    username: account.email,
    password: account.imap_password ?? "",
    auth_method: mapAuthMethod(account.auth_method),
  };
}
