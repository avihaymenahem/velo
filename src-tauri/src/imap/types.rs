use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapConfig {
    pub host: String,
    pub port: u16,
    pub security: String, // "tls", "starttls", "none"
    pub username: String,
    pub password: String, // plaintext password or OAuth2 access token
    pub auth_method: String, // "password" or "oauth2"
    #[serde(default)]
    pub accept_invalid_certs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFolder {
    pub path: String,      // decoded UTF-8 display name
    pub raw_path: String,  // original modified UTF-7 path for IMAP commands
    pub name: String,      // decoded display name (last segment)
    pub delimiter: String,
    pub special_use: Option<String>, // "\Sent", "\Trash", "\Drafts", "\Junk", "\Archive", "\All"
    pub exists: u32,
    pub unseen: u32,
}

/// Single entry in the body cache.
/// Both fields are stored together so one rusqlite UPDATE writes both.
#[derive(Debug, Clone)]
pub struct BodyEntry {
    pub body_html: Option<String>,
    pub body_text: Option<String>,
}

/// Global semaphore for limiting concurrent IMAP sync/download tasks.
/// Prevents memory exhaustion by limiting how many email bodies (often several MBs)
/// are held in the heap simultaneously.
pub struct SyncSemaphore {
    pub semaphore: tokio::sync::Semaphore,
}

impl SyncSemaphore {
    pub fn new(permits: usize) -> Self {
        Self {
            semaphore: tokio::sync::Semaphore::new(permits),
        }
    }
}

/// Body cache: Rust intercepts BOTH body_html and body_text before they cross the
/// Tauri IPC bridge, holding them here until imap_flush_bodies writes them directly
/// to SQLite via rusqlite — WebKit never touches any body content.
/// Key: (folder_path, uid). Populated by imap_fetch_messages_buffered; drained by imap_flush_bodies.
pub type BodyCache = Arc<Mutex<HashMap<(String, u32), BodyEntry>>>;

/// Header-only message transmitted over IPC during sync.
/// body_html and body_text are both absent — they go Rust BodyCache → rusqlite → SQLite
/// without ever touching the WebKit heap.
/// snippet (first 200 chars of plain text) IS included and used for AI urgency scoring.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapMessageMeta {
    pub uid: u32,
    pub folder: String,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub from_address: Option<String>,
    pub from_name: Option<String>,
    pub to_addresses: Option<String>,
    pub cc_addresses: Option<String>,
    pub bcc_addresses: Option<String>,
    pub reply_to: Option<String>,
    pub subject: Option<String>,
    pub date: i64,
    pub is_read: bool,
    pub is_starred: bool,
    pub is_draft: bool,
    pub snippet: Option<String>,
    pub raw_size: u32,
    pub list_unsubscribe: Option<String>,
    pub list_unsubscribe_post: Option<String>,
    pub auth_results: Option<String>,
    pub attachments: Vec<ImapAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFetchResultMeta {
    pub messages: Vec<ImapMessageMeta>,
    pub folder_status: ImapFolderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapMessage {
    pub uid: u32,
    pub folder: String,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub from_address: Option<String>,
    pub from_name: Option<String>,
    pub to_addresses: Option<String>,
    pub cc_addresses: Option<String>,
    pub bcc_addresses: Option<String>,
    pub reply_to: Option<String>,
    pub subject: Option<String>,
    pub date: i64,
    pub is_read: bool,
    pub is_starred: bool,
    pub is_draft: bool,
    pub body_html: Option<String>,
    pub body_text: Option<String>,
    pub snippet: Option<String>,
    pub raw_size: u32,
    pub list_unsubscribe: Option<String>,
    pub list_unsubscribe_post: Option<String>,
    pub auth_results: Option<String>,
    pub attachments: Vec<ImapAttachment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapAttachment {
    pub part_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u32,
    pub content_id: Option<String>,
    pub is_inline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFolderStatus {
    pub uidvalidity: u32,
    pub uidnext: u32,
    pub exists: u32,
    pub unseen: u32,
    pub highest_modseq: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFetchResult {
    pub messages: Vec<ImapMessage>,
    pub folder_status: ImapFolderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFolderSyncResult {
    pub uids: Vec<u32>,
    pub messages: Vec<ImapMessage>,
    pub folder_status: ImapFolderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFolderSearchResult {
    pub uids: Vec<u32>,
    pub folder_status: ImapFolderStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeltaCheckRequest {
    pub folder: String,
    pub last_uid: u32,
    pub uidvalidity: u32,
    /// Unix timestamp of the last successful sync for this folder.
    /// Used as a SINCE-date fallback when UID range search returns empty
    /// (works around DavMail/Exchange servers that don't reliably handle
    /// `UID SEARCH n:*` range queries).
    pub last_sync_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeltaCheckResult {
    pub folder: String,
    pub uidvalidity: u32,
    pub new_uids: Vec<u32>,
    pub uidvalidity_changed: bool,
}

/// Minimal data returned per message after Rust has persisted the batch to SQLite.
/// Only what JWZ threading needs — ~200 bytes per message, ~2 KB per batch of 10.
/// WebKit never sees message bodies or full metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapSyncHeader {
    pub local_id: String,
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub subject: Option<String>,
    pub date: i64,
    pub label_id: String,
    pub is_read: bool,
    pub is_starred: bool,
    pub is_draft: bool,
    pub has_attachments: bool,
    pub snippet: String,
    pub from_address: Option<String>,
    pub from_name: Option<String>,
    /// True when the message was stored to DB; false when skipped (duplicate RFC ID).
    /// TypeScript still uses skipped headers for cross-folder label accumulation.
    pub stored: bool,
}

/// Thread data sent from TypeScript to Rust after JWZ threading completes.
/// Contains pre-computed aggregate values — Rust writes them directly without SQL aggregates.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapThreadUpdate {
    pub thread_id: String,
    pub message_ids: Vec<String>,
    pub subject: Option<String>,
    pub snippet: Option<String>,
    pub last_message_at: i64,
    pub is_read: bool,
    pub is_starred: bool,
    pub has_attachments: bool,
    pub label_ids: Vec<String>,
}

// ---------------------------------------------------------------------------
// CID image batch resolver types
// ---------------------------------------------------------------------------

/// One CID image to fetch and cache — passed from JS to imap_batch_resolve_cid_images.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CidImageRequest {
    pub attachment_db_id: String,
    pub message_id: String,
    pub part_id: String,
    /// MIME type (e.g. "image/png") — used to pick the file extension so WebKit
    /// can skip MIME sniffing and route the asset directly through CoreGraphics.
    pub mime_type: Option<String>,
}

/// Result for one CID image — only the local cache path is returned to JS (no binary).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CidImageResult {
    pub attachment_db_id: String,
    pub local_path: String,
}

// ---------------------------------------------------------------------------
// Gmail zero-IPC types
// ---------------------------------------------------------------------------

/// A single Gmail message, sent from TypeScript to Rust for direct rusqlite storage.
/// Body data (body_html, body_text) goes Rust → SQLite without bouncing through WebKit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailMessage {
    pub id: String,
    pub from_address: Option<String>,
    pub from_name: Option<String>,
    pub to_addresses: Option<String>,
    pub cc_addresses: Option<String>,
    pub bcc_addresses: Option<String>,
    pub reply_to: Option<String>,
    pub subject: Option<String>,
    pub snippet: Option<String>,
    pub date: i64,
    pub is_read: bool,
    pub is_starred: bool,
    pub body_html: Option<String>,
    pub body_text: Option<String>,
    pub raw_size: Option<u32>,
    pub internal_date: Option<i64>,
    pub list_unsubscribe: Option<String>,
    pub list_unsubscribe_post: Option<String>,
    pub auth_results: Option<String>,
    pub message_id_header: Option<String>,
    pub references_header: Option<String>,
    pub in_reply_to_header: Option<String>,
}

/// A Gmail attachment, bundled alongside its parent message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailAttachment {
    pub id: String,
    pub message_id: String,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: Option<u32>,
    pub gmail_attachment_id: Option<String>,
    pub content_id: Option<String>,
    pub is_inline: bool,
}

/// Minimal acknowledgement returned by gmail_store_thread.
/// TypeScript only needs to know the thread was persisted — no body data returns.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GmailStoredHeader {
    pub thread_id: String,
    pub message_count: u32,
}
