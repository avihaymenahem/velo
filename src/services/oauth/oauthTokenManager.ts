import type { DbAccount } from "../db/accounts";
import { updateAccountTokens } from "../db/accounts";
import { getOAuthProvider } from "./providers";
import { refreshProviderToken } from "./oauthFlow";

/** Buffer before expiry to trigger a refresh (5 minutes) */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Ensure the account has a fresh OAuth2 access token.
 * If the token is within 5 minutes of expiry, refresh it and update the DB.
 * Returns the current (or refreshed) access token.
 *
 * Only applies to IMAP accounts with auth_method "oauth2".
 * For Gmail API accounts, token refresh is handled by GmailClient.
 */
export async function ensureFreshToken(account: DbAccount): Promise<string> {
  if (account.auth_method !== "oauth2" || !account.oauth_provider) {
    // Not an OAuth IMAP account — return whatever password/token is stored
    return account.access_token ?? account.imap_password ?? "";
  }

  if (!account.access_token) {
    throw new Error(`OAuth account ${account.email} has no access token`);
  }
  if (!account.refresh_token) {
    throw new Error(`OAuth account ${account.email} has no refresh token`);
  }

  const now = Date.now();
  const expiresAt = (account.token_expires_at ?? 0) * 1000; // DB stores seconds

  if (expiresAt - now > REFRESH_BUFFER_MS) {
    // Token is still valid
    return account.access_token;
  }

  // Token expired or about to expire — refresh it
  const provider = getOAuthProvider(account.oauth_provider);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${account.oauth_provider}`);
  }

  if (!account.oauth_client_id) {
    throw new Error(`OAuth account ${account.email} has no client ID`);
  }

  const tokens = await refreshProviderToken(
    provider,
    account.refresh_token,
    account.oauth_client_id,
    account.oauth_client_secret ?? undefined,
  );

  const newExpiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

  await updateAccountTokens(account.id, tokens.access_token, newExpiresAt);

  // Update the in-memory account object so callers get the fresh token
  account.access_token = tokens.access_token;
  account.token_expires_at = newExpiresAt;

  return tokens.access_token;
}
