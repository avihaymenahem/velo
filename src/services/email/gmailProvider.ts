import type { EmailProvider, EmailFolder, SyncResult } from "./types";
import type { GmailClient } from "../gmail/client";
import { parseGmailMessage, type ParsedMessage } from "../gmail/messageParser";

/** Map Gmail system label IDs to IMAP special-use flags */
const GMAIL_SPECIAL_USE: Record<string, string | null> = {
  INBOX: null,
  SENT: "\\Sent",
  TRASH: "\\Trash",
  DRAFT: "\\Drafts",
  SPAM: "\\Junk",
  STARRED: null,
  IMPORTANT: null,
  CATEGORY_PERSONAL: null,
  CATEGORY_SOCIAL: null,
  CATEGORY_PROMOTIONS: null,
  CATEGORY_UPDATES: null,
  CATEGORY_FORUMS: null,
  UNREAD: null,
  CHAT: null,
};

/**
 * EmailProvider adapter that wraps the existing GmailClient.
 * All operations delegate directly to the GmailClient methods.
 */
export class GmailApiProvider implements EmailProvider {
  readonly accountId: string;
  readonly type = "gmail_api" as const;
  private client: GmailClient;

  constructor(accountId: string, client: GmailClient) {
    this.accountId = accountId;
    this.client = client;
  }

  async listFolders(): Promise<EmailFolder[]> {
    const resp = await this.client.listLabels();
    return resp.labels.map((label) => ({
      id: label.id,
      name: label.name,
      path: label.name,
      type: label.type === "system" ? "system" : "user",
      specialUse:
        label.type === "system"
          ? (GMAIL_SPECIAL_USE[label.id] ?? null)
          : null,
      delimiter: "/",
      messageCount: label.messagesTotal ?? 0,
      unreadCount: label.messagesUnread ?? 0,
    }));
  }

  async createFolder(name: string, _parentPath?: string): Promise<EmailFolder> {
    const fullName = _parentPath ? `${_parentPath}/${name}` : name;
    const label = await this.client.createLabel(fullName);
    return {
      id: label.id,
      name: label.name,
      path: label.name,
      type: "user",
      specialUse: null,
      delimiter: "/",
      messageCount: 0,
      unreadCount: 0,
    };
  }

  async deleteFolder(path: string): Promise<void> {
    // In Gmail, path is the label ID for deletion
    await this.client.deleteLabel(path);
  }

  async renameFolder(path: string, newName: string): Promise<void> {
    await this.client.updateLabel(path, { name: newName });
  }

  async initialSync(
    _daysBack: number,
    _onProgress?: (phase: string, current: number, total: number) => void,
  ): Promise<SyncResult> {
    // Initial sync is handled by the existing sync.ts module.
    // This is a thin wrapper that returns the interface-compatible result.
    // Full integration will wire this up to the existing initialSync function.
    const profile = await this.client.getProfile();
    return {
      messages: [],
      latestSyncToken: profile.historyId,
    };
  }

  async deltaSync(syncToken: string): Promise<SyncResult> {
    // Delta sync is handled by the existing sync.ts module.
    // This is a thin wrapper that returns the interface-compatible result.
    const allMessages: ParsedMessage[] = [];
    let pageToken: string | undefined;
    let latestHistoryId = syncToken;

    do {
      const resp = await this.client.getHistory(
        syncToken,
        ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
        pageToken,
      );
      latestHistoryId = resp.historyId;

      if (resp.history) {
        for (const item of resp.history) {
          if (item.messagesAdded) {
            for (const added of item.messagesAdded) {
              const full = await this.client.getMessage(added.message.id);
              allMessages.push(parseGmailMessage(full));
            }
          }
        }
      }

      pageToken = resp.nextPageToken;
    } while (pageToken);

    return {
      messages: allMessages,
      latestSyncToken: latestHistoryId,
    };
  }

  async fetchMessage(messageId: string): Promise<ParsedMessage> {
    const msg = await this.client.getMessage(messageId);
    return parseGmailMessage(msg);
  }

  async fetchAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    const resp = await this.client.getAttachment(messageId, attachmentId);
    return { data: resp.data, size: resp.size };
  }

  async archive(threadId: string, _messageIds: string[]): Promise<void> {
    await this.client.modifyThread(threadId, undefined, ["INBOX"]);
  }

  async trash(threadId: string, _messageIds: string[]): Promise<void> {
    await this.client.modifyThread(threadId, ["TRASH"], ["INBOX"]);
  }

  async permanentDelete(
    threadId: string,
    _messageIds: string[],
  ): Promise<void> {
    await this.client.deleteThread(threadId);
  }

  async markRead(
    threadId: string,
    _messageIds: string[],
    read: boolean,
  ): Promise<void> {
    await this.client.modifyThread(
      threadId,
      read ? undefined : ["UNREAD"],
      read ? ["UNREAD"] : undefined,
    );
  }

  async star(
    threadId: string,
    _messageIds: string[],
    starred: boolean,
  ): Promise<void> {
    await this.client.modifyThread(
      threadId,
      starred ? ["STARRED"] : undefined,
      starred ? undefined : ["STARRED"],
    );
  }

  async spam(
    threadId: string,
    _messageIds: string[],
    isSpam: boolean,
  ): Promise<void> {
    await this.client.modifyThread(
      threadId,
      isSpam ? ["SPAM"] : ["INBOX"],
      isSpam ? ["INBOX"] : ["SPAM"],
    );
  }

  async moveToFolder(
    threadId: string,
    _messageIds: string[],
    folderPath: string,
  ): Promise<void> {
    await this.client.modifyThread(threadId, [folderPath], undefined);
  }

  async addLabel(threadId: string, labelId: string): Promise<void> {
    await this.client.modifyThread(threadId, [labelId], undefined);
  }

  async removeLabel(threadId: string, labelId: string): Promise<void> {
    await this.client.modifyThread(threadId, undefined, [labelId]);
  }

  async sendMessage(
    rawBase64Url: string,
    threadId?: string,
  ): Promise<{ id: string }> {
    const resp = await this.client.sendMessage(rawBase64Url, threadId);
    return { id: resp.id };
  }

  async createDraft(
    rawBase64Url: string,
    threadId?: string,
  ): Promise<{ draftId: string }> {
    const resp = await this.client.createDraft(rawBase64Url, threadId);
    return { draftId: resp.id };
  }

  async updateDraft(
    draftId: string,
    rawBase64Url: string,
    threadId?: string,
  ): Promise<{ draftId: string }> {
    const resp = await this.client.updateDraft(
      draftId,
      rawBase64Url,
      threadId,
    );
    return { draftId: resp.id };
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.client.deleteDraft(draftId);
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const profile = await this.client.getProfile();
      return {
        success: true,
        message: `Connected as ${profile.emailAddress}`,
      };
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof Error ? err.message : "Unknown connection error",
      };
    }
  }

  async getProfile(): Promise<{ email: string; name?: string }> {
    const profile = await this.client.getProfile();
    return { email: profile.emailAddress };
  }
}
