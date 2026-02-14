use async_imap::{types::Flag, Authenticator, Client, Session};
use base64::Engine;
use futures::StreamExt;
use mail_parser::{MessageParser, MimeHeaders};
use tokio::net::TcpStream;
use tokio_native_tls::TlsStream;

use super::types::*;

// ---------- XOAUTH2 authenticator ----------

struct XOAuth2 {
    response: Vec<u8>,
}

impl XOAuth2 {
    fn new(user: &str, access_token: &str) -> Self {
        // XOAUTH2 format: "user=" {user} "\x01auth=Bearer " {token} "\x01\x01"
        let s = format!("user={}\x01auth=Bearer {}\x01\x01", user, access_token);
        Self {
            response: s.into_bytes(),
        }
    }
}

impl Authenticator for XOAuth2 {
    type Response = Vec<u8>;
    fn process(&mut self, _challenge: &[u8]) -> Self::Response {
        // Return the initial XOAUTH2 string on the first (empty) challenge.
        // If the server sends a second challenge it means auth failed; we send
        // an empty response to let the server return a proper error.
        std::mem::take(&mut self.response)
    }
}

// ---------- Stream wrapper ----------

/// Wrapper to unify TLS / plain streams so Session can be generic.
pub(crate) enum ImapStream {
    Tls(TlsStream<TcpStream>),
    Plain(TcpStream),
}

impl tokio::io::AsyncRead for ImapStream {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match self.get_mut() {
            ImapStream::Tls(s) => std::pin::Pin::new(s).poll_read(cx, buf),
            ImapStream::Plain(s) => std::pin::Pin::new(s).poll_read(cx, buf),
        }
    }
}

impl tokio::io::AsyncWrite for ImapStream {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        match self.get_mut() {
            ImapStream::Tls(s) => std::pin::Pin::new(s).poll_write(cx, buf),
            ImapStream::Plain(s) => std::pin::Pin::new(s).poll_write(cx, buf),
        }
    }

    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match self.get_mut() {
            ImapStream::Tls(s) => std::pin::Pin::new(s).poll_flush(cx),
            ImapStream::Plain(s) => std::pin::Pin::new(s).poll_flush(cx),
        }
    }

    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match self.get_mut() {
            ImapStream::Tls(s) => std::pin::Pin::new(s).poll_shutdown(cx),
            ImapStream::Plain(s) => std::pin::Pin::new(s).poll_shutdown(cx),
        }
    }
}

impl std::fmt::Debug for ImapStream {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImapStream::Tls(_) => write!(f, "ImapStream::Tls"),
            ImapStream::Plain(_) => write!(f, "ImapStream::Plain"),
        }
    }
}

// ---------- Public API ----------

type ImapSession = Session<ImapStream>;

/// Establish an IMAP connection and authenticate.
///
/// Supports TLS (direct), STARTTLS (upgrade), and plain connections.
/// Auth methods: "password" (LOGIN) or "oauth2" (XOAUTH2).
pub async fn connect(config: &ImapConfig) -> Result<ImapSession, String> {
    if config.security == "starttls" {
        // STARTTLS requires a special flow: connect plain, upgrade, then auth.
        // We handle it separately because the greeting is consumed during upgrade.
        return connect_starttls(config).await;
    }

    let stream = connect_stream(config).await?;
    let client = Client::new(stream);
    authenticate(client, config).await
}

/// List all IMAP folders/mailboxes.
pub async fn list_folders(session: &mut ImapSession) -> Result<Vec<ImapFolder>, String> {
    let names = session
        .list(Some(""), Some("*"))
        .await
        .map_err(|e| format!("LIST failed: {e}"))?;

    let names: Vec<_> = names
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    let mut folders = Vec::new();
    for name in &names {
        let path = name.name().to_string();
        let delimiter = name.delimiter().unwrap_or("/").to_string();

        // Extract display name (last segment after delimiter)
        let display_name = path
            .rsplit_once(&delimiter)
            .map(|(_, last)| last.to_string())
            .unwrap_or_else(|| path.clone());

        // Detect special-use from attributes (RFC 6154)
        let special_use = detect_special_use(name);

        // Get message counts via STATUS (ignore errors for non-selectable folders)
        let (exists, unseen) = match session
            .status(&path, "(MESSAGES UNSEEN)")
            .await
        {
            Ok(mailbox) => (mailbox.exists, mailbox.unseen.unwrap_or(0)),
            Err(_) => (0, 0),
        };

        folders.push(ImapFolder {
            path,
            name: display_name,
            delimiter,
            special_use,
            exists,
            unseen,
        });
    }

    Ok(folders)
}

/// Fetch messages from a folder by UID range (e.g. "1:100" or "500:*").
pub async fn fetch_messages(
    session: &mut ImapSession,
    folder: &str,
    uid_range: &str,
) -> Result<ImapFetchResult, String> {
    let mailbox = session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let folder_status = ImapFolderStatus {
        uidvalidity: mailbox.uid_validity.unwrap_or(0),
        uidnext: mailbox.uid_next.unwrap_or(0),
        exists: mailbox.exists,
        unseen: mailbox.unseen.unwrap_or(0),
        highest_modseq: mailbox.highest_modseq,
    };

    let fetches = session
        .uid_fetch(uid_range, "UID FLAGS INTERNALDATE BODY.PEEK[]")
        .await
        .map_err(|e| format!("UID FETCH failed: {e}"))?;

    let fetches: Vec<_> = fetches
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    let parser = MessageParser::default();
    let mut messages = Vec::new();
    for fetch in &fetches {
        let uid = match fetch.uid {
            Some(u) => u,
            None => continue,
        };

        let raw = match fetch.body() {
            Some(b) => b,
            None => continue,
        };

        let raw_size = raw.len() as u32;

        // Parse flags
        let flags: Vec<_> = fetch.flags().collect();
        let is_read = flags.iter().any(|f| matches!(f, Flag::Seen));
        let is_starred = flags.iter().any(|f| matches!(f, Flag::Flagged));
        let is_draft = flags.iter().any(|f| matches!(f, Flag::Draft));

        match parse_message(&parser, raw, uid, folder, raw_size, is_read, is_starred, is_draft) {
            Ok(msg) => messages.push(msg),
            Err(e) => {
                log::warn!("Failed to parse message UID {uid}: {e}");
            }
        }
    }

    Ok(ImapFetchResult {
        messages,
        folder_status,
    })
}

/// Fetch a single message body by UID.
pub async fn fetch_message_body(
    session: &mut ImapSession,
    folder: &str,
    uid: u32,
) -> Result<ImapMessage, String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let uid_str = uid.to_string();
    let fetches = session
        .uid_fetch(&uid_str, "UID FLAGS BODY.PEEK[]")
        .await
        .map_err(|e| format!("UID FETCH failed: {e}"))?;

    let fetches: Vec<_> = fetches
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    let fetch = fetches
        .first()
        .ok_or_else(|| format!("Message UID {uid} not found in {folder}"))?;

    let raw = fetch
        .body()
        .ok_or_else(|| format!("No body for UID {uid}"))?;

    let raw_size = raw.len() as u32;
    let flags: Vec<_> = fetch.flags().collect();
    let is_read = flags.iter().any(|f| matches!(f, Flag::Seen));
    let is_starred = flags.iter().any(|f| matches!(f, Flag::Flagged));
    let is_draft = flags.iter().any(|f| matches!(f, Flag::Draft));

    let parser = MessageParser::default();
    parse_message(&parser, raw, uid, folder, raw_size, is_read, is_starred, is_draft)
}

/// Get UIDs of messages newer than `last_uid`.
pub async fn fetch_new_uids(
    session: &mut ImapSession,
    folder: &str,
    last_uid: u32,
) -> Result<Vec<u32>, String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let query = format!("{}:*", last_uid + 1);
    let uids = session
        .uid_search(&query)
        .await
        .map_err(|e| format!("UID SEARCH failed: {e}"))?;

    // Filter out last_uid itself (IMAP returns it if it's the highest UID)
    let mut result: Vec<u32> = uids.into_iter().filter(|&u| u > last_uid).collect();
    result.sort();
    Ok(result)
}

/// Set or remove flags on messages.
///
/// `flag_op`: "+FLAGS" to add, "-FLAGS" to remove
/// `flags`: e.g. "(\\Seen)" or "(\\Flagged)"
pub async fn set_flags(
    session: &mut ImapSession,
    folder: &str,
    uid_set: &str,
    flag_op: &str,
    flags: &str,
) -> Result<(), String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let query = format!("{flag_op} {flags}");
    let stream = session
        .uid_store(uid_set, &query)
        .await
        .map_err(|e| format!("UID STORE failed: {e}"))?;

    // Consume the response stream
    let _: Vec<_> = stream.collect().await;
    Ok(())
}

/// Move messages between folders.
///
/// Tries MOVE first; falls back to COPY + flag Deleted + EXPUNGE.
pub async fn move_messages(
    session: &mut ImapSession,
    source_folder: &str,
    uid_set: &str,
    dest_folder: &str,
) -> Result<(), String> {
    session
        .select(source_folder)
        .await
        .map_err(|e| format!("SELECT {source_folder} failed: {e}"))?;

    // Try MOVE extension first
    match session.uid_mv(uid_set, dest_folder).await {
        Ok(()) => return Ok(()),
        Err(_) => {
            // Fallback: COPY, then mark Deleted, then EXPUNGE
            session
                .uid_copy(uid_set, dest_folder)
                .await
                .map_err(|e| format!("UID COPY failed: {e}"))?;

            let store_stream = session
                .uid_store(uid_set, "+FLAGS (\\Deleted)")
                .await
                .map_err(|e| format!("UID STORE +Deleted failed: {e}"))?;
            let _: Vec<_> = store_stream.collect().await;

            let expunge_stream = session
                .expunge()
                .await
                .map_err(|e| format!("EXPUNGE failed: {e}"))?;
            let _: Vec<_> = expunge_stream.collect().await;
        }
    }

    Ok(())
}

/// Flag messages as deleted and expunge them.
pub async fn delete_messages(
    session: &mut ImapSession,
    folder: &str,
    uid_set: &str,
) -> Result<(), String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let store_stream = session
        .uid_store(uid_set, "+FLAGS (\\Deleted)")
        .await
        .map_err(|e| format!("UID STORE +Deleted failed: {e}"))?;
    let _: Vec<_> = store_stream.collect().await;

    let expunge_stream = session
        .expunge()
        .await
        .map_err(|e| format!("EXPUNGE failed: {e}"))?;
    let _: Vec<_> = expunge_stream.collect().await;

    Ok(())
}

/// Append a raw message to a folder (for saving sent mail or drafts).
pub async fn append_message(
    session: &mut ImapSession,
    folder: &str,
    flags: Option<&str>,
    raw_message: &[u8],
) -> Result<(), String> {
    session
        .append(folder, flags, None, raw_message)
        .await
        .map_err(|e| format!("APPEND failed: {e}"))
}

/// Get folder status (UIDVALIDITY, UIDNEXT, MESSAGES, UNSEEN).
pub async fn get_folder_status(
    session: &mut ImapSession,
    folder: &str,
) -> Result<ImapFolderStatus, String> {
    let mailbox = session
        .status(folder, "(UIDVALIDITY UIDNEXT MESSAGES UNSEEN)")
        .await
        .map_err(|e| format!("STATUS failed: {e}"))?;

    Ok(ImapFolderStatus {
        uidvalidity: mailbox.uid_validity.unwrap_or(0),
        uidnext: mailbox.uid_next.unwrap_or(0),
        exists: mailbox.exists,
        unseen: mailbox.unseen.unwrap_or(0),
        highest_modseq: mailbox.highest_modseq,
    })
}

/// Fetch a specific MIME part (attachment) by UID and part ID.
/// Returns the raw bytes base64-encoded.
pub async fn fetch_attachment(
    session: &mut ImapSession,
    folder: &str,
    uid: u32,
    part_id: &str,
) -> Result<String, String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let query = format!("BODY.PEEK[{part_id}]");
    let uid_str = uid.to_string();
    let fetches = session
        .uid_fetch(&uid_str, &query)
        .await
        .map_err(|e| format!("UID FETCH attachment failed: {e}"))?;

    let fetches: Vec<_> = fetches
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    let fetch = fetches
        .first()
        .ok_or_else(|| format!("No response for UID {uid} part {part_id}"))?;

    // The body() method returns the full BODY[] content; for partial fetches
    // it is still accessible via body().
    let data = fetch
        .body()
        .ok_or_else(|| format!("No body data for part {part_id}"))?;

    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}

/// Test IMAP connectivity: connect, login, list, logout.
pub async fn test_connection(config: &ImapConfig) -> Result<String, String> {
    let mut session = connect(config).await?;

    // Try listing folders to verify access
    let names = session
        .list(Some(""), Some("*"))
        .await
        .map_err(|e| format!("LIST failed: {e}"))?;

    let count = names.collect::<Vec<_>>().await.len();

    session.logout().await.map_err(|e| format!("LOGOUT failed: {e}"))?;

    Ok(format!(
        "Connected successfully. Found {} folder(s).",
        count
    ))
}

// ---------- Internal helpers ----------

/// Establish TCP + TLS or plain stream for "tls" and "none" security modes.
async fn connect_stream(config: &ImapConfig) -> Result<ImapStream, String> {
    let addr = (&*config.host, config.port);

    match config.security.as_str() {
        "tls" => {
            let native_connector = native_tls::TlsConnector::new()
                .map_err(|e| format!("Failed to create TLS connector: {e}"))?;
            let tls_connector = tokio_native_tls::TlsConnector::from(native_connector);
            let tcp = TcpStream::connect(addr)
                .await
                .map_err(|e| format!("TCP connect to {}:{} failed: {e}", config.host, config.port))?;
            let tls = tls_connector
                .connect(&config.host, tcp)
                .await
                .map_err(|e| format!("TLS handshake with {} failed: {e}", config.host))?;
            Ok(ImapStream::Tls(tls))
        }
        "none" => {
            let tcp = TcpStream::connect(addr)
                .await
                .map_err(|e| format!("TCP connect to {}:{} failed: {e}", config.host, config.port))?;
            Ok(ImapStream::Plain(tcp))
        }
        other => Err(format!(
            "Unknown security mode: {other}. Use \"tls\", \"starttls\", or \"none\"."
        )),
    }
}

/// Handle STARTTLS connection: connect plain, upgrade to TLS, then authenticate.
///
/// STARTTLS is special because we must issue the STARTTLS command on the plain
/// connection, upgrade the underlying TCP stream to TLS, and then create a new
/// Client on the TLS stream for authentication.
async fn connect_starttls(config: &ImapConfig) -> Result<ImapSession, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let addr = (&*config.host, config.port);
    let mut tcp = TcpStream::connect(addr)
        .await
        .map_err(|e| format!("TCP connect to {}:{} failed: {e}", config.host, config.port))?;

    // Read the server greeting (read until we get a complete line ending with \r\n)
    let mut buf = vec![0u8; 4096];
    let n = tcp
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read server greeting: {e}"))?;
    let greeting = String::from_utf8_lossy(&buf[..n]);
    if !greeting.contains("OK") {
        return Err(format!("Unexpected server greeting: {greeting}"));
    }

    // Send STARTTLS command
    tcp.write_all(b"a001 STARTTLS\r\n")
        .await
        .map_err(|e| format!("Failed to send STARTTLS: {e}"))?;

    // Read STARTTLS response
    let n = tcp
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read STARTTLS response: {e}"))?;
    let response = String::from_utf8_lossy(&buf[..n]);
    if !response.contains("OK") {
        return Err(format!("STARTTLS rejected: {response}"));
    }

    // Upgrade to TLS
    let native_connector = native_tls::TlsConnector::new()
        .map_err(|e| format!("Failed to create TLS connector: {e}"))?;
    let tls_connector = tokio_native_tls::TlsConnector::from(native_connector);
    let tls = tls_connector
        .connect(&config.host, tcp)
        .await
        .map_err(|e| format!("TLS upgrade after STARTTLS failed: {e}"))?;

    // Create a new IMAP client on the TLS stream and authenticate
    let client = Client::new(ImapStream::Tls(tls));
    authenticate(client, config).await
}

/// Authenticate with the IMAP server (LOGIN or XOAUTH2).
async fn authenticate(
    client: Client<ImapStream>,
    config: &ImapConfig,
) -> Result<ImapSession, String> {
    match config.auth_method.as_str() {
        "oauth2" => {
            let auth = XOAuth2::new(&config.username, &config.password);
            client
                .authenticate("XOAUTH2", auth)
                .await
                .map_err(|(e, _)| format!("XOAUTH2 authentication failed: {e}"))
        }
        _ => client
            .login(&config.username, &config.password)
            .await
            .map_err(|(e, _)| format!("Login failed: {e}")),
    }
}

/// Detect special-use attribute from IMAP folder attributes and name heuristics.
fn detect_special_use(name: &async_imap::types::Name) -> Option<String> {
    use async_imap::types::NameAttribute;

    // Check RFC 6154 attributes first
    for attr in name.attributes() {
        let special = match attr {
            NameAttribute::Sent => Some("\\Sent"),
            NameAttribute::Trash => Some("\\Trash"),
            NameAttribute::Drafts => Some("\\Drafts"),
            NameAttribute::Junk => Some("\\Junk"),
            NameAttribute::Archive => Some("\\Archive"),
            NameAttribute::All => Some("\\All"),
            NameAttribute::Flagged => Some("\\Flagged"),
            _ => None,
        };
        if let Some(s) = special {
            return Some(s.to_string());
        }
    }

    // Heuristic fallback based on common folder names
    let lower = name.name().to_lowercase();
    match lower.as_str() {
        "sent" | "sent messages" | "sent items" | "[gmail]/sent mail" => {
            Some("\\Sent".to_string())
        }
        "trash" | "deleted" | "deleted items" | "deleted messages" | "[gmail]/trash" => {
            Some("\\Trash".to_string())
        }
        "drafts" | "draft" | "[gmail]/drafts" => Some("\\Drafts".to_string()),
        "junk" | "spam" | "junk e-mail" | "[gmail]/spam" => Some("\\Junk".to_string()),
        "archive" | "archives" | "[gmail]/all mail" => Some("\\Archive".to_string()),
        _ => None,
    }
}

/// Parse a raw email message into our ImapMessage struct.
fn parse_message(
    parser: &MessageParser,
    raw: &[u8],
    uid: u32,
    folder: &str,
    raw_size: u32,
    is_read: bool,
    is_starred: bool,
    is_draft: bool,
) -> Result<ImapMessage, String> {
    let message = parser.parse(raw).ok_or("Failed to parse MIME message")?;

    let message_id = message.message_id().map(|s| s.to_string());
    let subject = message.subject().map(|s| s.to_string());
    let date = message.date().map(|d| d.to_timestamp()).unwrap_or(0);

    // In-Reply-To
    let in_reply_to = match message.in_reply_to() {
        mail_parser::HeaderValue::Text(t) => Some(t.to_string()),
        mail_parser::HeaderValue::TextList(list) => list.first().map(|s| s.to_string()),
        _ => None,
    };

    // References (space-separated message IDs)
    let references = match message.references() {
        mail_parser::HeaderValue::Text(t) => Some(t.to_string()),
        mail_parser::HeaderValue::TextList(list) => {
            if list.is_empty() {
                None
            } else {
                Some(list.iter().map(|s| s.as_ref()).collect::<Vec<_>>().join(" "))
            }
        }
        _ => None,
    };

    // Addresses
    let (from_address, from_name) = extract_first_address(message.from());
    let to_addresses = format_address_list(message.to());
    let cc_addresses = format_address_list(message.cc());
    let bcc_addresses = format_address_list(message.bcc());
    let reply_to = format_address_list(message.reply_to());

    // Body
    let body_text = message.body_text(0).map(|s| s.to_string());
    let body_html = message.body_html(0).map(|s| s.to_string());

    // Generate snippet from text body (truncate at char boundary)
    let snippet = body_text.as_ref().map(|text| {
        let cleaned: String = text
            .chars()
            .map(|c| if c.is_whitespace() { ' ' } else { c })
            .collect();
        let trimmed = cleaned.trim();
        if trimmed.chars().count() > 200 {
            let end: String = trimmed.chars().take(200).collect();
            format!("{end}...")
        } else {
            trimmed.to_string()
        }
    });

    // List-Unsubscribe headers
    let list_unsubscribe = extract_header_text(message.header(mail_parser::HeaderName::ListUnsubscribe));
    let list_unsubscribe_post = extract_header_text(
        message.header(mail_parser::HeaderName::Other("List-Unsubscribe-Post".into())),
    );

    // Authentication-Results header
    let auth_results = extract_header_text(
        message.header(mail_parser::HeaderName::Other("Authentication-Results".into())),
    );

    // Attachments
    let attachments: Vec<ImapAttachment> = message
        .attachments()
        .enumerate()
        .map(|(i, att)| {
            let mime_type = att
                .content_type()
                .map(|ct| {
                    let ctype = ct.ctype();
                    let subtype = ct.subtype().unwrap_or("octet-stream");
                    format!("{ctype}/{subtype}")
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());

            ImapAttachment {
                part_id: format!("{}", i + 1),
                filename: att
                    .attachment_name()
                    .unwrap_or("attachment")
                    .to_string(),
                mime_type,
                size: att.len() as u32,
                content_id: att.content_id().map(|s| s.to_string()),
                is_inline: att.content_disposition().map_or(false, |cd| cd.is_inline()),
            }
        })
        .collect();

    Ok(ImapMessage {
        uid,
        folder: folder.to_string(),
        message_id,
        in_reply_to,
        references,
        from_address,
        from_name,
        to_addresses,
        cc_addresses,
        bcc_addresses,
        reply_to,
        subject,
        date,
        is_read,
        is_starred,
        is_draft,
        body_html,
        body_text,
        snippet,
        raw_size,
        list_unsubscribe,
        list_unsubscribe_post,
        auth_results,
        attachments,
    })
}

/// Extract a text value from a HeaderValue, if present.
fn extract_header_text(hv: Option<&mail_parser::HeaderValue>) -> Option<String> {
    match hv {
        Some(mail_parser::HeaderValue::Text(t)) => Some(t.to_string()),
        Some(mail_parser::HeaderValue::TextList(list)) => {
            Some(list.iter().map(|s| s.as_ref()).collect::<Vec<_>>().join(", "))
        }
        _ => None,
    }
}

/// Extract the first address (email, display name) from an Address field.
fn extract_first_address(
    addr: Option<&mail_parser::Address>,
) -> (Option<String>, Option<String>) {
    let addr = match addr {
        Some(a) => a,
        None => return (None, None),
    };

    if let Some(first) = addr.first() {
        let email = first.address.as_ref().map(|s| s.to_string());
        let name = first.name.as_ref().map(|s| s.to_string());
        (email, name)
    } else {
        (None, None)
    }
}

/// Format an address list as a comma-separated string of "Name <email>" or "email".
fn format_address_list(addr: Option<&mail_parser::Address>) -> Option<String> {
    let addr = match addr {
        Some(a) => a,
        None => return None,
    };

    let parts: Vec<String> = addr
        .iter()
        .map(|a| {
            let email = a.address.as_deref().unwrap_or("");
            match a.name.as_deref() {
                Some(name) if !name.is_empty() => format!("{name} <{email}>"),
                _ => email.to_string(),
            }
        })
        .collect();

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}
