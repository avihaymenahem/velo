import type { EmailProvider, EmailFolder, SyncResult } from "./types";
import type { ParsedMessage } from "../gmail/messageParser";
import { buildImapConfig, buildSmtpConfig } from "../imap/imapConfigBuilder";
import { imapInitialSync, imapDeltaSync, imapMessageToParsedMessage } from "../imap/imapSync";
import { mapFolderToLabel, getSyncableFolders } from "../imap/folderMapper";
import {
  imapListFolders,
  imapSetFlags,
  imapMoveMessages,
  imapDeleteMessages,
  imapFetchMessageBody,
  imapFetchAttachment,
  imapTestConnection,
  imapAppendMessage,
  smtpSendEmail,
  smtpTestConnection,
  type ImapConfig,
  type SmtpConfig,
} from "../imap/tauriCommands";
import { getAccount, type DbAccount } from "../db/accounts";
import { findSpecialFolder } from "../imap/messageHelper";

/**
 * EmailProvider adapter for IMAP/SMTP accounts.
 * Delegates to Tauri IMAP/SMTP commands via the imapSync engine.
 */
export class ImapSmtpProvider implements EmailProvider {
  readonly accountId: string;
  readonly type = "imap" as const;

  private _imapConfig: ImapConfig | null = null;
  private _smtpConfig: SmtpConfig | null = null;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  private async getAccount(): Promise<DbAccount> {
    const account = await getAccount(this.accountId);
    if (!account) {
      throw new Error(`Account ${this.accountId} not found`);
    }
    return account;
  }

  private async getImapConfig(): Promise<ImapConfig> {
    if (!this._imapConfig) {
      const account = await this.getAccount();
      this._imapConfig = buildImapConfig(account);
    }
    return this._imapConfig;
  }

  private async getSmtpConfig(): Promise<SmtpConfig> {
    if (!this._smtpConfig) {
      const account = await this.getAccount();
      this._smtpConfig = buildSmtpConfig(account);
    }
    return this._smtpConfig;
  }

  /**
   * Invalidate cached configs (e.g., after password change).
   */
  clearConfigCache(): void {
    this._imapConfig = null;
    this._smtpConfig = null;
  }

  // ---- Folder/Label operations ----

  async listFolders(): Promise<EmailFolder[]> {
    const config = await this.getImapConfig();
    const imapFolders = await imapListFolders(config);
    const syncable = getSyncableFolders(imapFolders);

    return syncable.map((f) => {
      const mapping = mapFolderToLabel(f);
      return {
        id: mapping.labelId,
        name: mapping.labelName,
        path: f.path,
        type: mapping.type as "system" | "user",
        specialUse: f.special_use,
        delimiter: f.delimiter,
        messageCount: f.exists,
        unreadCount: f.unseen,
      };
    });
  }

  async createFolder(
    _name: string,
    _parentPath?: string,
  ): Promise<EmailFolder> {
    throw new Error(
      "Creating folders is not supported for IMAP accounts via the current command set. " +
        "Please create the folder directly on the mail server.",
    );
  }

  async deleteFolder(_path: string): Promise<void> {
    throw new Error(
      "Deleting folders is not supported for IMAP accounts via the current command set. " +
        "Please delete the folder directly on the mail server.",
    );
  }

  async renameFolder(_path: string, _newName: string): Promise<void> {
    throw new Error(
      "Renaming folders is not supported for IMAP accounts via the current command set. " +
        "Please rename the folder directly on the mail server.",
    );
  }

  // ---- Sync operations ----

  async initialSync(
    daysBack: number,
    onProgress?: (phase: string, current: number, total: number) => void,
  ): Promise<SyncResult> {
    return imapInitialSync(this.accountId, daysBack, onProgress ? (p) => {
      onProgress(p.phase, p.current, p.total);
    } : undefined);
  }

  async deltaSync(_syncToken: string): Promise<SyncResult> {
    return imapDeltaSync(this.accountId);
  }

  // ---- Message operations ----

  async fetchMessage(messageId: string): Promise<ParsedMessage> {
    const { folder, uid } = this.parseImapMessageId(messageId);

    if (uid === null || !folder) {
      throw new Error(`Invalid IMAP message ID format: ${messageId}`);
    }

    const config = await this.getImapConfig();
    const imapMsg = await imapFetchMessageBody(config, folder, uid);

    const { parsed } = imapMessageToParsedMessage(
      imapMsg,
      this.accountId,
      folder,
    );
    parsed.id = messageId;

    return parsed;
  }

  async fetchAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    const { folder, uid } = this.parseImapMessageId(messageId);

    if (uid === null || !folder) {
      throw new Error(`Invalid IMAP message ID format: ${messageId}`);
    }

    const config = await this.getImapConfig();
    const data = await imapFetchAttachment(config, folder, uid, attachmentId);
    return { data, size: data.length };
  }

  // ---- Actions ----

  async archive(
    _threadId: string,
    _messageIds: string[],
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);
    const archiveFolder =
      (await findSpecialFolder(this.accountId, "\\Archive")) ?? "Archive";

    for (const [folder, uids] of grouped) {
      if (folder === archiveFolder) continue;
      await imapMoveMessages(config, folder, uids, archiveFolder);
    }
  }

  async trash(
    _threadId: string,
    _messageIds: string[],
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);
    const trashFolder =
      (await findSpecialFolder(this.accountId, "\\Trash")) ?? "Trash";

    for (const [folder, uids] of grouped) {
      if (folder === trashFolder) continue;
      await imapMoveMessages(config, folder, uids, trashFolder);
    }
  }

  async permanentDelete(
    _threadId: string,
    _messageIds: string[],
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);

    for (const [folder, uids] of grouped) {
      await imapDeleteMessages(config, folder, uids);
    }
  }

  async markRead(
    _threadId: string,
    _messageIds: string[],
    read: boolean,
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);

    for (const [folder, uids] of grouped) {
      await imapSetFlags(config, folder, uids, ["Seen"], read);
    }
  }

  async star(
    _threadId: string,
    _messageIds: string[],
    starred: boolean,
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);

    for (const [folder, uids] of grouped) {
      await imapSetFlags(config, folder, uids, ["Flagged"], starred);
    }
  }

  async spam(
    _threadId: string,
    _messageIds: string[],
    isSpam: boolean,
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);
    const junkFolder =
      (await findSpecialFolder(this.accountId, "\\Junk")) ?? "Junk";
    const destination = isSpam ? junkFolder : "INBOX";

    for (const [folder, uids] of grouped) {
      if (folder === destination) continue;
      await imapMoveMessages(config, folder, uids, destination);
    }
  }

  async moveToFolder(
    _threadId: string,
    _messageIds: string[],
    folderPath: string,
  ): Promise<void> {
    const config = await this.getImapConfig();
    const grouped = this.groupByFolder(_messageIds);

    for (const [folder, uids] of grouped) {
      if (folder === folderPath) continue;
      await imapMoveMessages(config, folder, uids, folderPath);
    }
  }

  async addLabel(
    _threadId: string,
    _labelId: string,
  ): Promise<void> {
    // IMAP doesn't have native labels — this would require COPY to another folder
    // or using IMAP keywords (if server supports them).
    // For now, this is a no-op with a warning.
    console.warn(
      "IMAP does not natively support labels. " +
        "Use moveToFolder() to move messages between folders instead.",
    );
  }

  async removeLabel(
    _threadId: string,
    _labelId: string,
  ): Promise<void> {
    // IMAP doesn't have native labels.
    console.warn(
      "IMAP does not natively support labels. " +
        "Use moveToFolder() to move messages between folders instead.",
    );
  }

  // ---- Send/Draft operations ----

  async sendMessage(
    rawBase64Url: string,
    _threadId?: string,
  ): Promise<{ id: string }> {
    const smtpConfig = await this.getSmtpConfig();
    const result = await smtpSendEmail(smtpConfig, rawBase64Url);
    if (!result.success) {
      throw new Error(`SMTP send failed: ${result.message}`);
    }

    // Copy sent message to Sent folder via IMAP APPEND
    try {
      const imapConfig = await this.getImapConfig();
      const sentFolder =
        (await findSpecialFolder(this.accountId, "\\Sent")) ?? "Sent";
      await imapAppendMessage(imapConfig, sentFolder, rawBase64Url, "(\\Seen)");
    } catch (err) {
      // Non-fatal: message was sent successfully, just not copied to Sent folder
      console.warn("Failed to copy sent message to Sent folder:", err);
    }

    const messageId = `imap-sent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { id: messageId };
  }

  async createDraft(
    rawBase64Url: string,
    _threadId?: string,
  ): Promise<{ draftId: string }> {
    const config = await this.getImapConfig();
    const draftsFolder =
      (await findSpecialFolder(this.accountId, "\\Drafts")) ?? "Drafts";

    await imapAppendMessage(config, draftsFolder, rawBase64Url, "(\\Draft)");

    // IMAP APPEND does not return the new UID, so generate a pseudo draft ID
    const draftId = `imap-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { draftId };
  }

  async updateDraft(
    draftId: string,
    rawBase64Url: string,
    _threadId?: string,
  ): Promise<{ draftId: string }> {
    // Delete the old draft first, then create a new one
    try {
      await this.deleteDraft(draftId);
    } catch {
      // Old draft may already be gone; continue with creating the new one
    }

    return this.createDraft(rawBase64Url, _threadId);
  }

  async deleteDraft(draftId: string): Promise<void> {
    // Try to parse draft ID to get folder + UID info
    // Draft IDs from IMAP are in message ID format: imap-{accountId}-{folder}-{uid}
    const { folder, uid } = this.parseImapMessageId(draftId);

    if (uid !== null && folder) {
      const config = await this.getImapConfig();
      await imapDeleteMessages(config, folder, [uid]);
    } else {
      // Generated draft IDs (imap-draft-...) can't be mapped back to a server UID
      console.warn(
        `Draft ${draftId} has a generated ID and cannot be deleted from server. ` +
          "It will be cleaned up on next sync.",
      );
    }
  }

  // ---- Connection ----

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const imapConfig = await this.getImapConfig();
      const imapResult = await imapTestConnection(imapConfig);

      // Also test SMTP connectivity
      try {
        const smtpConfig = await this.getSmtpConfig();
        const smtpResult = await smtpTestConnection(smtpConfig);
        if (!smtpResult.success) {
          return {
            success: false,
            message: `IMAP OK, but SMTP failed: ${smtpResult.message}`,
          };
        }
      } catch (err) {
        return {
          success: false,
          message: `IMAP OK, but SMTP failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      return { success: true, message: `Connected: ${imapResult}` };
    } catch (err) {
      return {
        success: false,
        message: `IMAP connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getProfile(): Promise<{ email: string; name?: string }> {
    const account = await this.getAccount();
    return {
      email: account.email,
      name: account.display_name ?? undefined,
    };
  }

  // ---- Helpers ----

  /**
   * Parse IMAP message IDs and group UIDs by folder.
   * Message ID format: imap-{accountId}-{folder}-{uid}
   * Since accountId can contain hyphens, we strip the known prefix
   * "imap-{this.accountId}-" and then parse the remaining "{folder}-{uid}".
   */
  private groupByFolder(messageIds: string[]): Map<string, number[]> {
    const grouped = new Map<string, number[]>();
    const prefix = `imap-${this.accountId}-`;

    for (const messageId of messageIds) {
      const { folder, uid } = this.parseImapMessageId(messageId, prefix);

      if (uid === null || !folder) {
        console.warn(`Skipping invalid IMAP message ID: ${messageId}`);
        continue;
      }

      const existing = grouped.get(folder);
      if (existing) {
        existing.push(uid);
      } else {
        grouped.set(folder, [uid]);
      }
    }

    return grouped;
  }

  /**
   * Parse an IMAP message ID into folder and uid.
   * Returns { folder, uid } or { folder: null, uid: null } if invalid.
   */
  private parseImapMessageId(
    messageId: string,
    prefix?: string,
  ): { folder: string | null; uid: number | null } {
    const p = prefix ?? `imap-${this.accountId}-`;

    if (!messageId.startsWith(p)) {
      return { folder: null, uid: null };
    }

    // After stripping prefix, remainder is "{folder}-{uid}"
    const remainder = messageId.slice(p.length);
    const lastDash = remainder.lastIndexOf("-");
    if (lastDash === -1) {
      return { folder: null, uid: null };
    }

    const folder = remainder.slice(0, lastDash);
    const uid = parseInt(remainder.slice(lastDash + 1), 10);

    if (!folder || isNaN(uid)) {
      return { folder: null, uid: null };
    }

    return { folder, uid };
  }
}
