import { GmailClient } from "./client";
import { startOAuthFlow } from "./auth";
import { getAllAccounts, getAccount, updateAccountAllTokens } from "../db/accounts";
import { getSetting, getSecureSetting } from "../db/settings";

// In-memory cache of active GmailClient instances per account
const clients = new Map<string, GmailClient>();

/**
 * Get or create a GmailClient for the given account.
 */
export async function getGmailClient(
  accountId: string,
): Promise<GmailClient> {
  const existing = clients.get(accountId);
  if (existing) return existing;

  const clientId = await getClientId();
  const clientSecret = await getClientSecret();
  const accounts = await getAllAccounts();
  const account = accounts.find((a) => a.id === accountId);

  if (!account) throw new Error(`Account ${accountId} not found`);
  if (!account.access_token || !account.refresh_token) {
    throw new Error(`Account ${accountId} has no tokens`);
  }

  const client = new GmailClient(accountId, clientId, {
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresAt: account.token_expires_at ?? 0,
  }, clientSecret);

  clients.set(accountId, client);
  return client;
}

/**
 * Remove a client from cache (e.g., on account removal or re-auth).
 */
export function removeClient(accountId: string): void {
  clients.delete(accountId);
}

/**
 * Get the Google OAuth client ID from settings.
 */
export async function getClientId(): Promise<string> {
  const clientId = await getSetting("google_client_id");
  if (!clientId) {
    throw new Error("Google Client ID not configured. Go to Settings to set it up.");
  }
  return clientId;
}

/**
 * Get the Google OAuth client secret from settings (optional, for Web app clients).
 */
export async function getClientSecret(): Promise<string | undefined> {
  const clientSecret = await getSecureSetting("google_client_secret");
  return clientSecret ?? undefined;
}

/**
 * Initialize clients for all active accounts on app startup.
 */
export async function initializeClients(): Promise<void> {
  const accounts = await getAllAccounts();
  const clientId = await getSetting("google_client_id");
  if (!clientId) return;
  const clientSecret = (await getSecureSetting("google_client_secret")) ?? undefined;

  for (const account of accounts) {
    if (account.is_active && account.access_token && account.refresh_token) {
      const client = new GmailClient(account.id, clientId, {
        accessToken: account.access_token,
        refreshToken: account.refresh_token,
        expiresAt: account.token_expires_at ?? 0,
      }, clientSecret);
      clients.set(account.id, client);
    }
  }
}

/**
 * Re-authorize an existing account to obtain new tokens (e.g., after scope changes).
 * Preserves all local data — only replaces tokens.
 */
export async function reauthorizeAccount(
  accountId: string,
  expectedEmail: string,
): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const clientId = await getClientId();
  const clientSecret = await getClientSecret();

  const { tokens, userInfo } = await startOAuthFlow(clientId, clientSecret);

  if (userInfo.email.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(
      `Signed in as ${userInfo.email}, but expected ${expectedEmail}. Please sign in with the correct account.`,
    );
  }

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Please revoke app access at https://myaccount.google.com/permissions and try again.",
    );
  }

  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  await updateAccountAllTokens(accountId, tokens.access_token, tokens.refresh_token, expiresAt);

  // Evict stale client and create a fresh one
  clients.delete(accountId);
  const client = new GmailClient(accountId, clientId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
  }, clientSecret);
  clients.set(accountId, client);
}
