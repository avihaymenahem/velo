import type { ParsedMessage } from "../gmail/messageParser";

export type AccountProvider = "gmail_api" | "imap";

export interface EmailFolder {
  id: string;
  name: string;
  path: string;
  type: "system" | "user";
  specialUse: string | null;
  delimiter: string;
  messageCount: number;
  unreadCount: number;
}

export interface SyncResult {
  messages: ParsedMessage[];
  folderStatus?: {
    uidvalidity: number;
    lastUid: number;
    modseq?: number;
  };
  latestSyncToken?: string;
}

export interface EmailProvider {
  readonly accountId: string;
  readonly type: AccountProvider;

  // Folder/Label operations
  listFolders(): Promise<EmailFolder[]>;
  createFolder(name: string, parentPath?: string): Promise<EmailFolder>;
  deleteFolder(path: string): Promise<void>;
  renameFolder(path: string, newName: string): Promise<void>;

  // Sync operations
  initialSync(
    daysBack: number,
    onProgress?: (phase: string, current: number, total: number) => void,
  ): Promise<SyncResult>;
  deltaSync(syncToken: string): Promise<SyncResult>;

  // Message operations
  fetchMessage(messageId: string): Promise<ParsedMessage>;
  fetchAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }>;

  // Actions (operate on thread/message level)
  archive(threadId: string, messageIds: string[]): Promise<void>;
  trash(threadId: string, messageIds: string[]): Promise<void>;
  permanentDelete(threadId: string, messageIds: string[]): Promise<void>;
  markRead(
    threadId: string,
    messageIds: string[],
    read: boolean,
  ): Promise<void>;
  star(
    threadId: string,
    messageIds: string[],
    starred: boolean,
  ): Promise<void>;
  spam(
    threadId: string,
    messageIds: string[],
    isSpam: boolean,
  ): Promise<void>;
  moveToFolder(
    threadId: string,
    messageIds: string[],
    folderPath: string,
  ): Promise<void>;
  addLabel(threadId: string, labelId: string): Promise<void>;
  removeLabel(threadId: string, labelId: string): Promise<void>;

  // Send/Draft operations
  sendMessage(
    rawBase64Url: string,
    threadId?: string,
  ): Promise<{ id: string }>;
  createDraft(
    rawBase64Url: string,
    threadId?: string,
  ): Promise<{ draftId: string }>;
  updateDraft(
    draftId: string,
    rawBase64Url: string,
    threadId?: string,
  ): Promise<{ draftId: string }>;
  deleteDraft(draftId: string): Promise<void>;

  // Connection
  testConnection(): Promise<{ success: boolean; message: string }>;
  getProfile(): Promise<{ email: string; name?: string }>;
}
