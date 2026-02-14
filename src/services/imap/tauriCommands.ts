import { invoke } from '@tauri-apps/api/core';

// ---------- IMAP types ----------

export interface ImapConfig {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  username: string;
  password: string; // plaintext password or OAuth2 access token
  auth_method: 'password' | 'oauth2';
}

export interface ImapFolder {
  path: string;
  name: string;
  delimiter: string;
  special_use: string | null;
  exists: number;
  unseen: number;
}

export interface ImapMessage {
  uid: number;
  folder: string;
  message_id: string | null;
  in_reply_to: string | null;
  references: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  reply_to: string | null;
  subject: string | null;
  date: number;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  body_html: string | null;
  body_text: string | null;
  snippet: string | null;
  raw_size: number;
  list_unsubscribe: string | null;
  list_unsubscribe_post: string | null;
  auth_results: string | null;
  attachments: ImapAttachment[];
}

export interface ImapAttachment {
  part_id: string;
  filename: string;
  mime_type: string;
  size: number;
  content_id: string | null;
  is_inline: boolean;
}

export interface ImapFolderStatus {
  uidvalidity: number;
  uidnext: number;
  exists: number;
  unseen: number;
  highest_modseq: number | null;
}

export interface ImapFetchResult {
  messages: ImapMessage[];
  folder_status: ImapFolderStatus;
}

// ---------- SMTP types ----------

export interface SmtpConfig {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  username: string;
  password: string;
  auth_method: 'password' | 'oauth2';
}

export interface SmtpSendResult {
  success: boolean;
  message: string;
}

// ---------- IMAP commands ----------

/**
 * Test IMAP connectivity: connect, authenticate, list folders, logout.
 * Returns a success message string.
 */
export async function imapTestConnection(config: ImapConfig): Promise<string> {
  return invoke<string>('imap_test_connection', { config });
}

/**
 * List all IMAP folders/mailboxes on the server.
 */
export async function imapListFolders(config: ImapConfig): Promise<ImapFolder[]> {
  return invoke<ImapFolder[]>('imap_list_folders', { config });
}

/**
 * Fetch messages from a folder by UID list.
 * Returns parsed messages along with folder status metadata.
 */
export async function imapFetchMessages(
  config: ImapConfig,
  folder: string,
  uids: number[]
): Promise<ImapFetchResult> {
  return invoke<ImapFetchResult>('imap_fetch_messages', { config, folder, uids });
}

/**
 * Get UIDs of messages newer than `sinceUid` in the given folder.
 */
export async function imapFetchNewUids(
  config: ImapConfig,
  folder: string,
  sinceUid: number
): Promise<number[]> {
  return invoke<number[]>('imap_fetch_new_uids', { config, folder, sinceUid });
}

/**
 * Fetch a single message with full body by UID.
 */
export async function imapFetchMessageBody(
  config: ImapConfig,
  folder: string,
  uid: number
): Promise<ImapMessage> {
  return invoke<ImapMessage>('imap_fetch_message_body', { config, folder, uid });
}

/**
 * Set or remove flags on messages.
 * @param flags - Flag names (e.g. "Seen", "Flagged", "Draft"). Backslash prefix is added automatically.
 * @param add - true to add flags, false to remove them.
 */
export async function imapSetFlags(
  config: ImapConfig,
  folder: string,
  uids: number[],
  flags: string[],
  add: boolean
): Promise<void> {
  return invoke<void>('imap_set_flags', { config, folder, uids, flags, add });
}

/**
 * Move messages from one folder to another.
 * Uses MOVE extension if available, falls back to COPY+DELETE.
 */
export async function imapMoveMessages(
  config: ImapConfig,
  folder: string,
  uids: number[],
  destination: string
): Promise<void> {
  return invoke<void>('imap_move_messages', { config, folder, uids, destination });
}

/**
 * Permanently delete messages (flag as Deleted + EXPUNGE).
 */
export async function imapDeleteMessages(
  config: ImapConfig,
  folder: string,
  uids: number[]
): Promise<void> {
  return invoke<void>('imap_delete_messages', { config, folder, uids });
}

/**
 * Append a raw message to a folder (for saving sent mail or drafts).
 * @param rawMessage - The full email message encoded as base64url.
 * @param flags - Optional IMAP flags string (e.g. "(\\Seen)" or "(\\Draft)").
 */
export async function imapAppendMessage(
  config: ImapConfig,
  folder: string,
  rawMessage: string,
  flags?: string
): Promise<void> {
  return invoke<void>('imap_append_message', { config, folder, flags: flags ?? null, rawMessage });
}

/**
 * Get folder status (UIDVALIDITY, UIDNEXT, message count, unseen count).
 */
export async function imapGetFolderStatus(
  config: ImapConfig,
  folder: string
): Promise<ImapFolderStatus> {
  return invoke<ImapFolderStatus>('imap_get_folder_status', { config, folder });
}

/**
 * Fetch a specific MIME part (attachment) by UID and part ID.
 * Returns the attachment data as a base64-encoded string.
 */
export async function imapFetchAttachment(
  config: ImapConfig,
  folder: string,
  uid: number,
  partId: string
): Promise<string> {
  return invoke<string>('imap_fetch_attachment', { config, folder, uid, partId });
}

// ---------- SMTP commands ----------

/**
 * Send a pre-built RFC 2822 email via SMTP.
 * @param rawEmail - The full email message encoded as base64url.
 */
export async function smtpSendEmail(
  config: SmtpConfig,
  rawEmail: string
): Promise<SmtpSendResult> {
  return invoke<SmtpSendResult>('smtp_send_email', { config, rawEmail });
}

/**
 * Test SMTP connectivity by connecting and authenticating.
 */
export async function smtpTestConnection(config: SmtpConfig): Promise<SmtpSendResult> {
  return invoke<SmtpSendResult>('smtp_test_connection', { config });
}
