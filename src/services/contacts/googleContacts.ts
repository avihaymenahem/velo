import { refreshAccessToken, type TokenResponse } from "../gmail/auth";
import { getDb, selectFirstBy } from "../db/connection";
import { getSetting, getSecureSetting } from "../db/settings";
import { encryptValue, decryptValue } from "@/utils/crypto";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";

const PEOPLE_API_BASE = "https://people.googleapis.com/v1";
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface GoogleContact {
  resourceName: string;
  etag: string;
  names?: { displayName?: string; givenName?: string }[];
  emailAddresses?: { value: string; type?: string }[];
  phoneNumbers?: { value: string; type?: string }[];
  photo?: { url: string };
}

/**
 * Google Contacts API client with automatic token refresh.
 */
export class GoogleContactsClient {
  private accountId: string;
  private clientId: string;
  private clientSecret?: string;
  private tokenInfo: TokenInfo;
  private refreshPromise: Promise<void> | null = null;

  constructor(accountId: string, clientId: string, tokenInfo: TokenInfo, clientSecret?: string) {
    this.accountId = accountId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tokenInfo = tokenInfo;
  }

  private async getValidToken(): Promise<string> {
    const now = getCurrentUnixTimestamp();
    if (this.tokenInfo.expiresAt - now < 300) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken().finally(() => {
          this.refreshPromise = null;
        });
      }
      await this.refreshPromise;
    }
    return this.tokenInfo.accessToken;
  }

  private async refreshToken(): Promise<void> {
    const tokens: TokenResponse = await refreshAccessToken(
      this.tokenInfo.refreshToken,
      this.clientId,
      this.clientSecret,
    );

    const expiresAt = getCurrentUnixTimestamp() + tokens.expires_in;

    this.tokenInfo = {
      accessToken: tokens.access_token,
      refreshToken: this.tokenInfo.refreshToken,
      expiresAt,
    };

    const db = await getDb();
    const encAccessToken = await encryptValue(tokens.access_token);
    await db.execute(
      "UPDATE accounts SET access_token = $1, token_expires_at = $2, updated_at = unixepoch() WHERE id = $3",
      [encAccessToken, expiresAt, this.accountId],
    );
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      const response = await fetch(url, options);
      if (response.status !== 429) return response;

      lastResponse = response;
      if (attempt === MAX_RETRY_ATTEMPTS - 1) break;

      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return lastResponse!;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.getValidToken();
    const url = path.startsWith("http")
      ? path
      : `${PEOPLE_API_BASE}${path}`;

    const response = await this.fetchWithRetry(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshToken().finally(() => {
          this.refreshPromise = null;
        });
      }
      await this.refreshPromise;
      const retryToken = this.tokenInfo.accessToken;
      const retry = await this.fetchWithRetry(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${retryToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
      if (!retry.ok) {
        throw new Error(`People API error: ${retry.status} ${await retry.text()}`);
      }
      if (retry.status === 204) return undefined as T;
      return retry.json();
    }

    if (!response.ok) {
      throw new Error(`People API error: ${response.status} ${await response.text()}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  /**
   * List contacts from Google's directory.
   * Uses syncToken for delta sync if provided.
   */
  async listContacts(
    syncToken?: string,
    pageToken?: string,
    pageSize = 1000,
  ): Promise<{
    connections: GoogleContact[];
    nextPageToken?: string;
    nextSyncToken?: string;
    totalPeople?: number;
  }> {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      personFields: "names,emailAddresses,phoneNumbers,photos",
      sources: "READ_SOURCE_TYPE_CONTACT",
    });

    if (syncToken) {
      params.set("syncToken", syncToken);
    }

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const path = `/people/me/connections?${params.toString()}`;
    const result = await this.request<{connections: GoogleContact[], nextPageToken?: string, nextSyncToken?: string, totalPeople?: number}>(path);

    return result;
  }

  /**
   * Get a specific contact by resource name.
   */
  async getContact(
    resourceName: string,
  ): Promise<GoogleContact> {
    const encoded = encodeURIComponent(resourceName);
    const path = `/people/${encoded}?personFields=names,emailAddresses,phoneNumbers,photos`;
    return this.request(path);
  }
}

interface Account {
  id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  provider: string;
}

/**
 * Get Google Contacts client for a Gmail account.
 */
export async function getGoogleContactsClient(
  accountId: string,
): Promise<GoogleContactsClient | null> {
  const account = await selectFirstBy<Account>(
    "SELECT * FROM accounts WHERE id = $1 AND provider = 'gmail_api' LIMIT 1",
    [accountId],
  );

  if (!account) return null;

  const clientId = await getSetting("google_client_id");
  const clientSecret = await getSecureSetting("google_client_secret");

  if (!clientId) return null;

  const tokenInfo: TokenInfo = {
    accessToken: await decryptValue(account.access_token),
    refreshToken: await decryptValue(account.refresh_token),
    expiresAt: account.token_expires_at,
  };

  return new GoogleContactsClient(accountId, clientId, tokenInfo, clientSecret ?? undefined);
}

/**
 * Sync contacts from Google to local database.
 * Returns number of contacts synced.
 */
/**
 * Sync contacts from Google to local database.
 * Returns number of contacts synced.
 */
export async function syncGoogleContacts(
  accountId: string,
  onProgress?: (current: number, total: number | undefined) => void,
): Promise<number> {
  const client = await getGoogleContactsClient(accountId);
  if (!client) {
    throw new Error("No Gmail account found or account not authenticated");
  }

  // Get previous sync token from settings (convert null to undefined)
  const storedSyncToken = await getSetting(`contacts_sync_token_${accountId}`);
  const previousSyncToken: string | undefined = storedSyncToken ?? undefined;

  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let syncedCount = 0;
  let totalPeople: number | undefined;
  let useSyncToken = previousSyncToken;

  let page = 0;
  try {
    do {
      page++;
      const result = await client.listContacts(useSyncToken, pageToken);
      useSyncToken = undefined;

      console.log(
        `[contacts] Page ${page}: ${result.connections?.length ?? 0} connections,`,
        `nextPageToken: ${result.nextPageToken ? "yes" : "no"},`,
        `totalPeople: ${result.totalPeople ?? "n/a"}`,
      );

      // Capture total from first page (only present on full sync, not delta)
      if (totalPeople === undefined && result.totalPeople !== undefined) {
        totalPeople = result.totalPeople;
      }

      const { importContact } = await import("../db/contacts");

      for (const person of result.connections ?? []) {
        // Get ALL emails for this contact (not just first one)
        const emails = person.emailAddresses;
        if (!emails || emails.length === 0) continue;

        // Build display name - use first name available
        const name = person.names?.[0]?.displayName ?? person.names?.[0]?.givenName;
        const displayName: string | null = name ?? null;

        // Save each email as separate contact
        for (const emailEntry of emails) {
          const email = emailEntry.value;
          if (!email) continue;

          await importContact(email, displayName);
          syncedCount++;
          onProgress?.(syncedCount, totalPeople);
        }
      }

      console.log(`[contacts] Cumulative synced: ${syncedCount}`);

      nextSyncToken = result.nextSyncToken;
      pageToken = result.nextPageToken;

      // Small delay to avoid rate limiting
      if (pageToken) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } while (pageToken);

    console.log(`[contacts] Done. ${page} pages, ${syncedCount} total contacts with email.`);
  } catch (err) {
    console.error(`[contacts] Error on page ${page}:`, err);
    if (err instanceof Error && err.message.includes("410")) {
      console.warn("[contacts] Sync token expired, clearing for next full sync");
      const { setSetting } = await import("../db/settings");
      await setSetting(`contacts_sync_token_${accountId}`, "");
    }
    // Re-throw so the UI shows an error instead of silently stopping
    throw err;
  }

  // Save sync token for next sync
  if (nextSyncToken) {
    const { setSetting } = await import("../db/settings");
    await setSetting(`contacts_sync_token_${accountId}`, nextSyncToken);
  }

  return syncedCount;
}