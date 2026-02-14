import type { EmailProvider } from "./types";
import { GmailApiProvider } from "./gmailProvider";
import { ImapSmtpProvider } from "./imapSmtpProvider";
import { getAccount } from "../db/accounts";
import { getGmailClient } from "../gmail/tokenManager";

const providers = new Map<string, EmailProvider>();

/**
 * Get or create the appropriate EmailProvider for the given account.
 * Providers are cached in memory by account ID.
 */
export async function getEmailProvider(
  accountId: string,
): Promise<EmailProvider> {
  const existing = providers.get(accountId);
  if (existing) return existing;

  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  let provider: EmailProvider;

  if (account.provider === "imap") {
    provider = new ImapSmtpProvider(accountId);
  } else {
    // Default: gmail_api
    const client = await getGmailClient(accountId);
    provider = new GmailApiProvider(accountId, client);
  }

  providers.set(accountId, provider);
  return provider;
}

/**
 * Remove a provider from cache (e.g., on account removal or re-auth).
 */
export function removeProvider(accountId: string): void {
  providers.delete(accountId);
}

/**
 * Clear all cached providers.
 */
export function clearAllProviders(): void {
  providers.clear();
}
