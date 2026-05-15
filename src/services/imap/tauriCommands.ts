import { invoke } from '@tauri-apps/api/core';

// ---------- IMAP types ----------

export interface ImapConfig {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  username: string;
  password: string; // plaintext password or OAuth2 access token
  auth_method: 'password' | 'oauth2';
  accept_invalid_certs?: boolean;
}

export interface ImapFolder {
  path: string;       // decoded UTF-8 display name
  raw_path: string;   // original modified UTF-7 path for IMAP commands
  name: string;       // decoded display name (last segment)
  delimiter: string;
  special_use: string | null;
  exists: number;
  unseen: number;
}

/**
 * Lightweight message returned by imap_fetch_messages_buffered.
 * body_html AND body_text are both absent — Rust intercepts them into BodyCache
 * and writes them directly to SQLite via imap_flush_bodies (awaited after each batch).
 * snippet (first 200 chars of plain text) IS included for AI urgency scoring.
 */
export interface ImapMessageMeta {
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
  snippet: string | null;
  raw_size: number;
  list_unsubscribe: string | null;
  list_unsubscribe_post: string | null;
  auth_results: string | null;
  attachments: ImapAttachment[];
}

/** Full message — only used for on-demand body fetch (open message). */
export interface ImapMessage extends ImapMessageMeta {
  body_html: string | null;
  body_text: string | null;
}

export interface ImapFetchResultMeta {
  messages: ImapMessageMeta[];
  folder_status: ImapFolderStatus;
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

// ---------- Folder search result (lightweight: UIDs + status only) ----------

export interface ImapFolderSearchResult {
  uids: number[];
  folder_status: ImapFolderStatus;
}

// ---------- Folder sync result (single-connection search + fetch) ----------

export interface ImapFolderSyncResult {
  uids: number[];
  messages: ImapMessage[];
  folder_status: ImapFolderStatus;
}

// ---------- Delta check types ----------

export interface DeltaCheckRequest {
  folder: string;
  last_uid: number;
  uidvalidity: number;
  /** Unix timestamp of the last successful sync; used as SINCE-date fallback for DavMail/Exchange. */
  last_sync_at: number | null;
}

export interface DeltaCheckResult {
  folder: string;
  uidvalidity: number;
  new_uids: number[];
  uidvalidity_changed: boolean;
}

// ---------- SMTP types ----------

export interface SmtpConfig {
  host: string;
  port: number;
  security: 'tls' | 'starttls' | 'none';
  username: string;
  password: string;
  auth_method: 'password' | 'oauth2';
  accept_invalid_certs?: boolean;
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
 * NOTE: prefer imapFetchMessagesBuffered for sync — it avoids body_html crossing IPC.
 */
export async function imapFetchMessages(
  config: ImapConfig,
  folder: string,
  uids: number[]
): Promise<ImapFetchResult> {
  return invoke<ImapFetchResult>('imap_fetch_messages', { config, folder, uids });
}

/**
 * Fetch messages for sync: like imapFetchMessages but body_html is intercepted by Rust
 * and stored in a BodyCache (never serialised through WebKit). Returns ImapFetchResultMeta
 * (all header fields + body_text, no body_html). Call imapFlushBodies after writing
 * the metadata rows to DB to have Rust write the HTML directly to SQLite.
 */
export async function imapFetchMessagesBuffered(
  config: ImapConfig,
  folder: string,
  uids: number[]
): Promise<ImapFetchResultMeta> {
  return invoke<ImapFetchResultMeta>('imap_fetch_messages_buffered', { config, folder, uids });
}

/**
 * Drain body_html entries for the given (folder, uid) pairs from Rust's BodyCache
 * and write them directly to SQLite — bypassing the IPC bridge entirely.
 * Must be called after the corresponding message rows exist in DB.
 * Returns the count of rows updated.
 */
export async function imapFlushBodies(
  accountId: string,
  folder: string,
  uids: number[]
): Promise<number> {
  return invoke<number>('imap_flush_bodies', { accountId, folder, uids });
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
 * Search for all UIDs in a folder using UID SEARCH ALL.
 * Returns real UIDs — avoids the sparse UID gap problem with generateUidRange.
 */
export async function imapSearchAllUids(
  config: ImapConfig,
  folder: string
): Promise<number[]> {
  return invoke<number[]>('imap_search_all_uids', { config, folder });
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
): Promise<number> {
  return invoke<number>('imap_append_message', { config, folder, flags: flags ?? null, rawMessage });
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

/**
 * Fetch the raw RFC822 source of a single message by UID.
 * Returns the full message as a UTF-8 string.
 */
export async function imapFetchRawMessage(
  config: ImapConfig,
  folder: string,
  uid: number
): Promise<string> {
  return invoke<string>('imap_fetch_raw_message', { config, folder, uid });
}

/**
 * Check multiple folders for new UIDs in a single IMAP connection.
 * Replaces N separate imapGetFolderStatus + imapFetchNewUids calls with one round-trip.
 */
export async function imapDeltaCheck(
  config: ImapConfig,
  folders: DeltaCheckRequest[]
): Promise<DeltaCheckResult[]> {
  return invoke<DeltaCheckResult[]>('imap_delta_check', { config, folders });
}

/**
 * Sync a folder in a single IMAP connection: SELECT → UID SEARCH → batched UID FETCH.
 * When `sinceDate` is provided (format `DD-Mon-YYYY`), uses `UID SEARCH SINCE <date>`
 * to only fetch messages from that date onward, avoiding timeouts on large folders.
 */
export async function imapSyncFolder(
  config: ImapConfig,
  folder: string,
  batchSize: number,
  sinceDate?: string | null,
): Promise<ImapFolderSyncResult> {
  return invoke<ImapFolderSyncResult>('imap_sync_folder', { config, folder, batchSize, sinceDate: sinceDate ?? null });
}

/**
 * Search a folder for UIDs without fetching message bodies.
 * Returns UIDs and folder status — lightweight alternative to `imapSyncFolder`
 * for callers that fetch messages in smaller IPC-friendly chunks.
 */
export async function imapSearchFolder(
  config: ImapConfig,
  folder: string,
  sinceDate?: string | null,
): Promise<ImapFolderSearchResult> {
  return invoke<ImapFolderSearchResult>('imap_search_folder', { config, folder, sinceDate: sinceDate ?? null });
}

// ---------- Zero-IPC sync types ----------

/**
 * Minimal data returned per message after Rust has persisted the batch to SQLite.
 * Only what JWZ threading needs — ~200 bytes per message, regardless of body size.
 * WebKit never receives or allocates memory for message bodies during sync.
 */
export interface ImapSyncHeader {
  local_id: string;
  message_id: string | null;
  in_reply_to: string | null;
  references: string | null;
  subject: string | null;
  date: number;
  label_id: string;
  is_read: boolean;
  is_starred: boolean;
  is_draft: boolean;
  has_attachments: boolean;
  snippet: string;
  from_address: string | null;
  from_name: string | null;
  /** true = stored to DB; false = skipped (duplicate RFC ID from another folder). */
  stored: boolean;
}

/**
 * Thread data sent from TypeScript to Rust after JWZ threading completes.
 * Pre-computed aggregate values — Rust writes them directly without SQL aggregates.
 */
export interface ImapThreadUpdate {
  thread_id: string;
  message_ids: string[];
  subject: string | null;
  snippet: string | null;
  last_message_at: number;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  label_ids: string[];
}

/**
 * Fetch a batch of messages from IMAP and write thread, message (with full body),
 * and attachments directly to SQLite via rusqlite — zero WebKit IPC for SQL writes.
 * Returns only the minimal ImapSyncHeader slice needed for JWZ threading.
 */
export async function imapFetchAndStore(
  config: ImapConfig,
  accountId: string,
  folder: string,
  labelId: string,
  uids: number[],
  cutoffDate: number, // Unix seconds; 0 = no cutoff
): Promise<ImapSyncHeader[]> {
  return invoke<ImapSyncHeader[]>('imap_fetch_and_store', {
    config,
    accountId,
    folder,
    labelId,
    uids,
    cutoffDate,
  });
}

/**
 * Finalize threads after JWZ threading in TypeScript.
 * Writes final thread records, thread_labels, and message thread_id updates via rusqlite.
 * Also cleans up orphaned placeholder threads.
 * Returns the number of threads stored.
 */
export async function imapStoreThreads(
  accountId: string,
  threadUpdates: ImapThreadUpdate[],
  allLocalIds: string[],
): Promise<number> {
  return invoke<number>('imap_store_threads', {
    accountId,
    threadUpdates,
    allLocalIds,
  });
}

/**
 * Raw IMAP diagnostic: bypasses async-imap to show raw server responses.
 */
export async function imapRawFetchDiagnostic(
  config: ImapConfig,
  folder: string,
  uidRange: string,
): Promise<string> {
  return invoke<string>('imap_raw_fetch_diagnostic', { config, folder, uidRange });
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
