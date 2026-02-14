use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapConfig {
    pub host: String,
    pub port: u16,
    pub security: String, // "tls", "starttls", "none"
    pub username: String,
    pub password: String, // plaintext password or OAuth2 access token
    pub auth_method: String, // "password" or "oauth2"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImapFolder {
    pub path: String,
    pub name: String,
    pub delimiter: String,
    pub special_use: Option<String>, // "\Sent", "\Trash", "\Drafts", "\Junk", "\Archive", "\All"
    pub exists: u32,
    pub unseen: u32,
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
