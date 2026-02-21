import { refreshAccessToken, type TokenResponse } from "./auth";
import { getDb } from "../db/connection";
import { encryptValue } from "@/utils/crypto";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";

const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1";
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Gmail API client with automatic token refresh.
 */
export class GmailClient {
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
    // Refresh if token expires within 5 minutes
    if (this.tokenInfo.expiresAt - now < 300) {
      // Mutex: only one refresh at a time; concurrent callers await the same promise
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

    // Persist the new token (encrypted)
    const db = await getDb();
    const encAccessToken = await encryptValue(tokens.access_token);
    await db.execute(
      "UPDATE accounts SET access_token = $1, token_expires_at = $2, updated_at = unixepoch() WHERE id = $3",
      [encAccessToken, expiresAt, this.accountId],
    );
  }

  /**
   * Fetch with automatic retry on 429 (rate limit) responses.
   * Uses Retry-After header when available, otherwise exponential backoff.
   */
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
      : `${GMAIL_API_BASE}/users/me${path}`;

    const response = await this.fetchWithRetry(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Token might have been revoked — force refresh through the mutex
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
        throw new Error(`Gmail API error: ${retry.status} ${await retry.text()}`);
      }
      if (retry.status === 204) return undefined as T;
      return retry.json();
    }

    if (!response.ok) {
      throw new Error(
        `Gmail API error: ${response.status} ${await response.text()}`,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  async getProfile(): Promise<{ emailAddress: string; messagesTotal: number; threadsTotal: number; historyId: string }> {
    return this.request("/profile");
  }

  async listLabels(): Promise<{ labels: GmailLabel[] }> {
    return this.request("/labels");
  }

  async listThreads(params: {
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
    q?: string;
  } = {}): Promise<{ threads?: GmailThreadStub[]; nextPageToken?: string; resultSizeEstimate?: number }> {
    const searchParams = new URLSearchParams();
    if (params.labelIds) searchParams.set("labelIds", params.labelIds.join(","));
    if (params.maxResults) searchParams.set("maxResults", String(params.maxResults));
    if (params.pageToken) searchParams.set("pageToken", params.pageToken);
    if (params.q) searchParams.set("q", params.q);
    const qs = searchParams.toString();
    return this.request(`/threads${qs ? `?${qs}` : ""}`);
  }

  async getThread(threadId: string, format: "full" | "metadata" | "minimal" = "full"): Promise<GmailThread> {
    return this.request(`/threads/${threadId}?format=${format}`);
  }

  async getMessage(messageId: string, format: "full" | "metadata" | "minimal" | "raw" = "full"): Promise<GmailMessage> {
    return this.request(`/messages/${messageId}?format=${format}`);
  }

  async modifyThread(threadId: string, addLabelIds?: string[], removeLabelIds?: string[]): Promise<GmailThread> {
    return this.request(`/threads/${threadId}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }

  async getHistory(
    startHistoryId: string,
    historyTypes: string[] = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
    pageToken?: string,
  ): Promise<{
    history?: GmailHistoryItem[];
    historyId: string;
    nextPageToken?: string;
  }> {
    const params = new URLSearchParams({ startHistoryId });
    for (const ht of historyTypes) {
      params.append("historyTypes", ht);
    }
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    return this.request(`/history?${params.toString()}`);
  }

  /**
   * Create a new user label.
   */
  async createLabel(name: string, color?: { textColor: string; backgroundColor: string }): Promise<GmailLabel> {
    const body: Record<string, unknown> = {
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    };
    if (color) body.color = color;
    return this.request("/labels", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Update an existing label's name and/or color.
   */
  async updateLabel(labelId: string, updates: { name?: string; color?: { textColor: string; backgroundColor: string } | null }): Promise<GmailLabel> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.color !== undefined) body.color = updates.color;
    return this.request(`/labels/${labelId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * Delete a user label.
   */
  async deleteLabel(labelId: string): Promise<void> {
    const token = await this.getValidToken();
    const url = `${GMAIL_API_BASE}/users/me/labels/${labelId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
    }
  }

  /**
   * Permanently delete a thread (cannot be undone).
   * Used when deleting from Trash.
   */
  async deleteThread(threadId: string): Promise<void> {
    const token = await this.getValidToken();
    const url = `${GMAIL_API_BASE}/users/me/threads/${threadId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
    }
  }

  /**
   * Send an email via Gmail API.
   * Accepts a raw RFC 2822 message encoded as base64url.
   */
  async sendMessage(raw: string, threadId?: string): Promise<GmailMessage> {
    const body: Record<string, string> = { raw };
    if (threadId) body.threadId = threadId;
    return this.request("/messages/send", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Fetch a message attachment's binary data.
   * Returns base64url-encoded data.
   */
  async getAttachment(messageId: string, attachmentId: string): Promise<{ attachmentId: string; size: number; data: string }> {
    return this.request(`/messages/${messageId}/attachments/${attachmentId}`);
  }

  /**
   * Create a draft in Gmail.
   */
  async createDraft(raw: string, threadId?: string): Promise<{ id: string; message: GmailMessage }> {
    const message: Record<string, string> = { raw };
    if (threadId) message.threadId = threadId;
    return this.request("/drafts", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  /**
   * Update an existing draft.
   */
  async updateDraft(draftId: string, raw: string, threadId?: string): Promise<{ id: string; message: GmailMessage }> {
    const message: Record<string, string> = { raw };
    if (threadId) message.threadId = threadId;
    return this.request(`/drafts/${draftId}`, {
      method: "PUT",
      body: JSON.stringify({ message }),
    });
  }

  /**
   * Delete a draft.
   */
  async deleteDraft(draftId: string): Promise<void> {
    await this.request(`/drafts/${draftId}`, { method: "DELETE" });
  }

  /**
   * List drafts. Returns draft stubs with draft ID and message ID/threadId.
   */
  async listDrafts(): Promise<{ id: string; message: { id: string; threadId: string } }[]> {
    const resp = await this.request<{ drafts?: { id: string; message: { id: string; threadId: string } }[] }>("/drafts?maxResults=500");
    return resp.drafts ?? [];
  }
}

// Gmail API types
export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messageListVisibility?: "show" | "hide";
  labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: { textColor: string; backgroundColor: string };
}

export interface GmailThreadStub {
  id: string;
  snippet: string;
  historyId: string;
}

export interface GmailThread {
  id: string;
  historyId: string;
  messages: GmailMessage[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: GmailMessagePart;
  sizeEstimate: number;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: { attachmentId?: string; size: number; data?: string };
  parts?: GmailMessagePart[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailHistoryItem {
  id: string;
  messages?: GmailMessage[];
  messagesAdded?: { message: GmailMessage }[];
  messagesDeleted?: { message: GmailMessage }[];
  labelsAdded?: { message: GmailMessage; labelIds: string[] }[];
  labelsRemoved?: { message: GmailMessage; labelIds: string[] }[];
}
