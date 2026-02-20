use async_imap::{types::Flag, Authenticator, Client, Session};
use base64::Engine;
use futures::StreamExt;
use mail_parser::{MessageParser, MimeHeaders};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
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
        let raw_path = name.name().to_string();
        let delimiter = name.delimiter().unwrap_or("/").to_string();

        // Decode modified UTF-7 (RFC 3501 §5.1.3) to UTF-8 for display
        let path = utf7_imap::decode_utf7_imap(raw_path.clone());

        // Extract display name (last segment after delimiter)
        let display_name = path
            .rsplit_once(&delimiter)
            .map(|(_, last)| last.to_string())
            .unwrap_or_else(|| path.clone());

        // Detect special-use from attributes (RFC 6154)
        let special_use = detect_special_use(name);

        // Get message counts via STATUS — use raw_path for IMAP commands
        let (exists, unseen) = match session
            .status(&raw_path, "(MESSAGES UNSEEN)")
            .await
        {
            Ok(mailbox) => (mailbox.exists, mailbox.unseen.unwrap_or(0)),
            Err(_) => (0, 0),
        };

        folders.push(ImapFolder {
            path,
            raw_path,
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

    log::info!(
        "IMAP SELECT {folder}: exists={}, uidvalidity={}, uidnext={}, fetching UIDs: {uid_range}",
        mailbox.exists,
        mailbox.uid_validity.unwrap_or(0),
        mailbox.uid_next.unwrap_or(0),
    );

    // Try UID FETCH first; if the stream is empty, fall back to sequence-number FETCH.
    // Some IMAP servers return empty streams for UID FETCH despite valid UIDs.
    let fetches = session
        .uid_fetch(uid_range, "UID FLAGS INTERNALDATE BODY.PEEK[]")
        .await
        .map_err(|e| format!("UID FETCH {folder} uids={uid_range} failed: {e}"))?;

    let raw_fetches: Vec<_> = fetches.collect::<Vec<_>>().await;
    let mut fetch_ok = 0u32;
    let mut fetch_err = 0u32;
    let mut fetches = Vec::new();
    for r in raw_fetches {
        match r {
            Ok(f) => { fetch_ok += 1; fetches.push(f); }
            Err(e) => { fetch_err += 1; log::warn!("IMAP fetch stream error in {folder}: {e}"); }
        }
    }
    log::info!("IMAP FETCH {folder}: {fetch_ok} ok, {fetch_err} errors from uid_fetch");

    // If async-imap returned nothing but messages exist, fallback to raw TCP fetch
    if fetches.is_empty() && mailbox.exists > 0 {
        log::warn!("IMAP {folder}: async-imap returned 0 items but exists={}. Falling back to raw TCP fetch...", mailbox.exists);
        // Return early with raw fetch result — caller doesn't need to know about the fallback
        return Err(format!("ASYNC_IMAP_EMPTY:{folder}"));
    }

    let parser = MessageParser::default();
    let mut messages = Vec::new();
    for fetch in &fetches {
        let uid = match fetch.uid {
            Some(u) => u,
            None => { log::warn!("IMAP FETCH {folder}: response missing UID"); continue; }
        };

        let raw = match fetch.body() {
            Some(b) => b,
            None => { log::warn!("IMAP FETCH {folder}: UID {uid} has no body"); continue; }
        };

        let raw_size = raw.len() as u32;

        // Parse flags
        let flags: Vec<_> = fetch.flags().collect();
        let is_read = flags.iter().any(|f| matches!(f, Flag::Seen));
        let is_starred = flags.iter().any(|f| matches!(f, Flag::Flagged));
        let is_draft = flags.iter().any(|f| matches!(f, Flag::Draft));

        // Extract INTERNALDATE as fallback for messages with unparseable Date headers
        let internal_date = fetch.internal_date().map(|dt| dt.timestamp());

        match parse_message(&parser, raw, uid, folder, raw_size, is_read, is_starred, is_draft, internal_date) {
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
    parse_message(&parser, raw, uid, folder, raw_size, is_read, is_starred, is_draft, None)
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

/// Search for all UIDs in a folder using `UID SEARCH ALL`.
/// Returns real UIDs sorted ascending — avoids the sparse UID gap problem.
pub async fn search_all_uids(
    session: &mut ImapSession,
    folder: &str,
) -> Result<Vec<u32>, String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let uids = session
        .uid_search("ALL")
        .await
        .map_err(|e| format!("UID SEARCH ALL failed: {e}"))?;

    let mut result: Vec<u32> = uids.into_iter().collect();
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
/// Returns the decoded binary data as standard base64.
///
/// Fetches the full message via `BODY.PEEK[]`, parses it with `mail-parser`
/// (which handles all content-transfer-encoding decoding), and extracts
/// the requested part's decoded bytes.
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

    let uid_str = uid.to_string();
    let fetches = session
        .uid_fetch(&uid_str, "BODY.PEEK[]")
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
        .ok_or_else(|| format!("No response for UID {uid}"))?;

    let raw = fetch
        .body()
        .ok_or_else(|| format!("No body for UID {uid}"))?;

    // Parse the full message — mail-parser decodes content-transfer-encoding
    let parser = MessageParser::default();
    let message = parser
        .parse(raw)
        .ok_or_else(|| format!("Failed to parse message UID {uid}"))?;

    // Build section map and find the part index for the requested section path
    let section_map = build_imap_section_map(&message);
    let target_part_idx = section_map
        .iter()
        .find(|(_, section)| section.as_str() == part_id)
        .map(|(&idx, _)| idx)
        .ok_or_else(|| format!("Section {part_id} not found in message UID {uid}"))?;

    let part = message
        .parts
        .get(target_part_idx)
        .ok_or_else(|| format!("Part index {target_part_idx} out of range for UID {uid}"))?;

    // Extract the decoded binary content from the part
    let data = match &part.body {
        mail_parser::PartType::Binary(data) | mail_parser::PartType::InlineBinary(data) => {
            data.as_ref().to_vec()
        }
        mail_parser::PartType::Text(text) => text.as_bytes().to_vec(),
        mail_parser::PartType::Html(html) => html.as_bytes().to_vec(),
        mail_parser::PartType::Message(msg) => {
            // Nested message — encode the raw bytes
            msg.raw_message.as_ref().to_vec()
        }
        mail_parser::PartType::Multipart(_) => {
            return Err(format!("Part {part_id} is a multipart container, not a leaf part"));
        }
    };

    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Fetch the raw RFC822 source of a single message by UID.
/// Returns the full message as a UTF-8 string (lossy conversion for non-UTF-8 bytes).
pub async fn fetch_raw_message(
    session: &mut ImapSession,
    folder: &str,
    uid: u32,
) -> Result<String, String> {
    session
        .select(folder)
        .await
        .map_err(|e| format!("SELECT {folder} failed: {e}"))?;

    let uid_str = uid.to_string();
    let fetches = session
        .uid_fetch(&uid_str, "BODY.PEEK[]")
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

    Ok(String::from_utf8_lossy(raw).to_string())
}

/// Check multiple folders for new UIDs in a single IMAP session.
///
/// For each folder: SELECT, compare UIDVALIDITY, UID SEARCH for new messages.
/// This replaces N separate connections (status + fetch_new_uids per folder)
/// with a single connection that checks all folders.
pub async fn delta_check_folders(
    session: &mut ImapSession,
    folders: &[DeltaCheckRequest],
) -> Result<Vec<DeltaCheckResult>, String> {
    let mut results = Vec::with_capacity(folders.len());

    for req in folders {
        let mailbox = match session.select(&req.folder).await {
            Ok(m) => m,
            Err(e) => {
                log::warn!("delta_check: SELECT {} failed: {e}", req.folder);
                continue;
            }
        };

        let current_uidvalidity = mailbox.uid_validity.unwrap_or(0);
        let uidvalidity_changed = req.uidvalidity != 0 && current_uidvalidity != req.uidvalidity;

        if uidvalidity_changed {
            // UIDVALIDITY changed — caller must do full resync
            results.push(DeltaCheckResult {
                folder: req.folder.clone(),
                uidvalidity: current_uidvalidity,
                new_uids: vec![],
                uidvalidity_changed: true,
            });
            continue;
        }

        // UID SEARCH for messages newer than last_uid
        let query = format!("{}:*", req.last_uid + 1);
        let new_uids = match session.uid_search(&query).await {
            Ok(uids) => {
                let mut result: Vec<u32> = uids.into_iter().filter(|&u| u > req.last_uid).collect();
                result.sort();
                result
            }
            Err(e) => {
                log::warn!("delta_check: UID SEARCH {} failed: {e}", req.folder);
                vec![]
            }
        };

        results.push(DeltaCheckResult {
            folder: req.folder.clone(),
            uidvalidity: current_uidvalidity,
            new_uids,
            uidvalidity_changed: false,
        });
    }

    Ok(results)
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

/// Raw IMAP fetch: connect via raw TCP/TLS (bypassing async-imap),
/// authenticate, SELECT folder, UID FETCH with full body, parse responses.
///
/// This is a fallback for servers where async-imap fails to parse responses
/// (e.g. Mailo with non-standard flags like `Sent` without backslash).
pub async fn raw_fetch_messages(
    config: &ImapConfig,
    folder: &str,
    uid_range: &str,
) -> Result<ImapFetchResult, String> {
    log::info!("RAW IMAP FETCH: connecting to {}:{} for folder {folder}, UIDs {uid_range}", config.host, config.port);

    // Connect
    let stream = if config.security == "starttls" {
        raw_connect_starttls(config).await?
    } else {
        connect_stream(config).await?
    };

    let mut reader = BufReader::new(stream);

    // Read greeting (for non-STARTTLS)
    if config.security != "starttls" {
        let mut line = String::new();
        reader.read_line(&mut line).await.map_err(|e| format!("greeting: {e}"))?;
    }

    // LOGIN
    let login_cmd = if config.auth_method == "oauth2" {
        // XOAUTH2: AUTHENTICATE XOAUTH2 <base64>
        let xoauth2 = format!("user={}\x01auth=Bearer {}\x01\x01", config.username, config.password);
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, xoauth2.as_bytes());
        format!("a1 AUTHENTICATE XOAUTH2 {b64}\r\n")
    } else {
        format!("a1 LOGIN \"{}\" \"{}\"\r\n", config.username, config.password)
    };
    raw_send_and_wait(&mut reader, login_cmd.as_bytes(), "a1").await?;

    // SELECT
    let select_cmd = format!("a2 SELECT \"{folder}\"\r\n");
    let select_response = raw_send_and_wait(&mut reader, select_cmd.as_bytes(), "a2").await?;

    // Parse SELECT response for UIDVALIDITY, EXISTS, UNSEEN
    let mut exists = 0u32;
    let mut uidvalidity = 0u32;
    let mut unseen = 0u32;
    for line in select_response.lines() {
        if let Some(n) = parse_untagged_number(line, "EXISTS") {
            exists = n;
        }
        if line.contains("[UIDVALIDITY") {
            if let Some(v) = extract_bracket_number(line, "UIDVALIDITY") {
                uidvalidity = v;
            }
        }
        if line.contains("[UNSEEN") {
            if let Some(v) = extract_bracket_number(line, "UNSEEN") {
                unseen = v;
            }
        }
    }

    let folder_status = ImapFolderStatus {
        uidvalidity,
        uidnext: 0,
        exists,
        unseen,
        highest_modseq: None,
    };

    // UID FETCH with full body
    let fetch_cmd = format!("a3 UID FETCH {uid_range} (UID FLAGS INTERNALDATE BODY.PEEK[])\r\n");
    reader.get_mut().write_all(fetch_cmd.as_bytes()).await
        .map_err(|e| format!("FETCH write: {e}"))?;

    // Parse FETCH responses with literal handling
    let raw_messages = raw_parse_fetch_responses(&mut reader, "a3").await?;

    log::info!("RAW IMAP FETCH {folder}: parsed {} raw messages", raw_messages.len());

    // Parse each raw message
    let parser = MessageParser::default();
    let mut messages = Vec::new();

    for raw_msg in &raw_messages {
        match parse_message(
            &parser,
            &raw_msg.body,
            raw_msg.uid,
            folder,
            raw_msg.body.len() as u32,
            raw_msg.is_read,
            raw_msg.is_starred,
            raw_msg.is_draft,
            raw_msg.internal_date,
        ) {
            Ok(msg) => messages.push(msg),
            Err(e) => log::warn!("RAW FETCH: failed to parse UID {}: {e}", raw_msg.uid),
        }
    }

    // LOGOUT
    let _ = reader.get_mut().write_all(b"a4 LOGOUT\r\n").await;

    Ok(ImapFetchResult { messages, folder_status })
}

/// Raw IMAP diagnostic: connect via raw TCP/TLS (bypassing async-imap),
/// authenticate, SELECT folder, FETCH, and return raw server response.
/// This helps diagnose servers that async-imap can't parse.
pub async fn raw_fetch_diagnostic(
    config: &ImapConfig,
    folder: &str,
    uid_range: &str,
) -> Result<String, String> {
    // Connect and wrap in our ImapStream
    let mut stream = if config.security == "starttls" {
        raw_connect_starttls(config).await?
    } else {
        connect_stream(config).await?
    };

    let mut buf = vec![0u8; 16384];
    let mut output = String::new();

    // Read greeting (for non-STARTTLS)
    if config.security != "starttls" {
        let n = stream.read(&mut buf).await.map_err(|e| format!("greeting: {e}"))?;
        output.push_str(&format!("S: {}", String::from_utf8_lossy(&buf[..n])));
    }

    // LOGIN
    let login_cmd = format!("a1 LOGIN \"{}\" \"{}\"\r\n", config.username, config.password);
    stream.write_all(login_cmd.as_bytes()).await.map_err(|e| format!("LOGIN: {e}"))?;
    let n = stream.read(&mut buf).await.map_err(|e| format!("LOGIN read: {e}"))?;
    output.push_str(&format!("S: {}", String::from_utf8_lossy(&buf[..n])));

    // SELECT
    let select_cmd = format!("a2 SELECT \"{folder}\"\r\n");
    stream.write_all(select_cmd.as_bytes()).await.map_err(|e| format!("SELECT: {e}"))?;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    let n = stream.read(&mut buf).await.map_err(|e| format!("SELECT read: {e}"))?;
    output.push_str(&format!("S: {}", String::from_utf8_lossy(&buf[..n])));

    // UID FETCH — just get UID and FLAGS first (small response)
    let fetch_cmd = format!("a3 UID FETCH {uid_range} (UID FLAGS)\r\n");
    stream.write_all(fetch_cmd.as_bytes()).await.map_err(|e| format!("FETCH: {e}"))?;

    let mut fetch_response = String::new();
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        match tokio::time::timeout(std::time::Duration::from_secs(5), stream.read(&mut buf)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => {
                fetch_response.push_str(&String::from_utf8_lossy(&buf[..n]));
                if fetch_response.contains("a3 OK") || fetch_response.contains("a3 NO") || fetch_response.contains("a3 BAD") {
                    break;
                }
            }
            Ok(Err(e)) => { fetch_response.push_str(&format!("[read error: {e}]")); break; }
            Err(_) => { fetch_response.push_str("[timeout]"); break; }
        }
    }
    output.push_str(&format!("FETCH response:\n{fetch_response}"));

    let _ = stream.write_all(b"a4 LOGOUT\r\n").await;

    log::info!("RAW IMAP DIAGNOSTIC for {folder}:\n{output}");

    Ok(output)
}

// ---------- Raw TCP helpers ----------

/// Intermediate struct for a raw-parsed IMAP message before mail-parser processing.
struct RawFetchedMessage {
    uid: u32,
    is_read: bool,
    is_starred: bool,
    is_draft: bool,
    internal_date: Option<i64>,
    body: Vec<u8>,
}

/// Connect via STARTTLS for raw TCP operations.
async fn raw_connect_starttls(config: &ImapConfig) -> Result<ImapStream, String> {
    let addr = (&*config.host, config.port);
    let mut tcp = TcpStream::connect(addr).await.map_err(|e| format!("TCP: {e}"))?;
    let mut tmp = vec![0u8; 4096];
    let _ = tcp.read(&mut tmp).await; // consume greeting
    tcp.write_all(b"a0 STARTTLS\r\n").await.map_err(|e| format!("STARTTLS: {e}"))?;
    let n = tcp.read(&mut tmp).await.map_err(|e| format!("STARTTLS resp: {e}"))?;
    let resp = String::from_utf8_lossy(&tmp[..n]);
    if !resp.contains("OK") {
        return Err(format!("STARTTLS rejected: {resp}"));
    }
    let nc = native_tls::TlsConnector::new().map_err(|e| format!("TLS: {e}"))?;
    let tc = tokio_native_tls::TlsConnector::from(nc);
    let tls = tc.connect(&config.host, tcp).await.map_err(|e| format!("TLS: {e}"))?;
    Ok(ImapStream::Tls(tls))
}

/// Send a command and read all response lines until the tagged response (e.g. "a1 OK ...").
async fn raw_send_and_wait(
    reader: &mut tokio::io::BufReader<ImapStream>,
    cmd: &[u8],
    tag: &str,
) -> Result<String, String> {
    reader.get_mut().write_all(cmd).await
        .map_err(|e| format!("{tag} write: {e}"))?;

    let mut response = String::new();
    let tag_ok = format!("{tag} OK");
    let tag_no = format!("{tag} NO");
    let tag_bad = format!("{tag} BAD");

    loop {
        let mut line = String::new();
        match tokio::time::timeout(
            std::time::Duration::from_secs(30),
            reader.read_line(&mut line),
        ).await {
            Ok(Ok(0)) => return Err(format!("{tag}: connection closed")),
            Ok(Ok(_)) => {
                response.push_str(&line);
                if line.starts_with(&tag_ok) {
                    return Ok(response);
                }
                if line.starts_with(&tag_no) || line.starts_with(&tag_bad) {
                    return Err(format!("{tag} failed: {line}"));
                }
            }
            Ok(Err(e)) => return Err(format!("{tag} read: {e}")),
            Err(_) => return Err(format!("{tag}: timeout")),
        }
    }
}

/// Parse untagged responses like "* 3 EXISTS" → 3
fn parse_untagged_number(line: &str, keyword: &str) -> Option<u32> {
    // Format: "* <number> <KEYWORD>"
    let trimmed = line.trim();
    if !trimmed.starts_with("* ") || !trimmed.ends_with(keyword) {
        return None;
    }
    let middle = trimmed[2..trimmed.len() - keyword.len()].trim();
    middle.parse().ok()
}

/// Extract a number from bracket notation like "[UIDVALIDITY 12345]"
fn extract_bracket_number(line: &str, keyword: &str) -> Option<u32> {
    let pattern = format!("[{keyword} ");
    if let Some(start) = line.find(&pattern) {
        let after = &line[start + pattern.len()..];
        if let Some(end) = after.find(']') {
            return after[..end].trim().parse().ok();
        }
    }
    None
}

/// Parse IMAP FETCH responses with literal support ({size}\r\n...data...).
///
/// IMAP FETCH response format:
/// ```text
/// * 1 FETCH (UID 1 FLAGS (\Seen) INTERNALDATE "16-Feb-2026 12:00:00 +0000" BODY[] {1234}
/// <1234 bytes of raw email data>
/// )
/// a3 OK UID FETCH done
/// ```
async fn raw_parse_fetch_responses(
    reader: &mut tokio::io::BufReader<ImapStream>,
    tag: &str,
) -> Result<Vec<RawFetchedMessage>, String> {
    let mut messages: Vec<RawFetchedMessage> = Vec::new();
    let tag_ok = format!("{tag} OK");
    let tag_no = format!("{tag} NO");
    let tag_bad = format!("{tag} BAD");

    loop {
        let mut line = String::new();
        match tokio::time::timeout(
            std::time::Duration::from_secs(60),
            reader.read_line(&mut line),
        ).await {
            Ok(Ok(0)) => return Err("Connection closed during FETCH".to_string()),
            Ok(Ok(_)) => {
                // Check for tagged response (end of FETCH)
                if line.starts_with(&tag_ok) {
                    break;
                }
                if line.starts_with(&tag_no) || line.starts_with(&tag_bad) {
                    return Err(format!("FETCH failed: {line}"));
                }

                // Check for untagged FETCH response: "* <seq> FETCH (...)"
                if !line.starts_with("* ") || !line.contains("FETCH") {
                    continue;
                }

                // Parse UID from the response line
                let uid = extract_fetch_uid(&line).unwrap_or(0);
                if uid == 0 {
                    log::warn!("RAW FETCH: could not parse UID from: {}", line.trim());
                    // Still need to consume any literal
                    if let Some(literal_size) = extract_literal_size(&line) {
                        let mut discard = vec![0u8; literal_size];
                        reader.read_exact(&mut discard).await
                            .map_err(|e| format!("discard literal: {e}"))?;
                    }
                    continue;
                }

                // Parse flags
                let flags_str = extract_flags_from_fetch(&line);
                let is_read = flags_str.contains("\\Seen");
                let is_starred = flags_str.contains("\\Flagged");
                let is_draft = flags_str.contains("\\Draft");

                // Parse INTERNALDATE
                let internal_date = extract_internal_date(&line);

                // Check for literal: {size}
                if let Some(literal_size) = extract_literal_size(&line) {
                    // Read exactly `literal_size` bytes
                    let mut body = vec![0u8; literal_size];
                    reader.read_exact(&mut body).await
                        .map_err(|e| format!("read literal for UID {uid}: {e}"))?;

                    // Read the closing ")\r\n" after the literal
                    let mut closing = String::new();
                    let _ = reader.read_line(&mut closing).await;

                    messages.push(RawFetchedMessage {
                        uid,
                        is_read,
                        is_starred,
                        is_draft,
                        internal_date,
                        body,
                    });
                }
            }
            Ok(Err(e)) => return Err(format!("FETCH read: {e}")),
            Err(_) => return Err("FETCH timeout".to_string()),
        }
    }

    Ok(messages)
}

/// Extract UID from a FETCH response line like "* 1 FETCH (UID 123 FLAGS ...)"
fn extract_fetch_uid(line: &str) -> Option<u32> {
    // Look for "UID " followed by a number
    let uid_idx = line.find("UID ")?;
    let after_uid = &line[uid_idx + 4..];
    let end = after_uid.find(|c: char| !c.is_ascii_digit()).unwrap_or(after_uid.len());
    after_uid[..end].parse().ok()
}

/// Extract flags string from FETCH response like "FLAGS (\Seen \Flagged)"
fn extract_flags_from_fetch(line: &str) -> String {
    if let Some(flags_start) = line.find("FLAGS (") {
        let after = &line[flags_start + 7..];
        if let Some(end) = after.find(')') {
            return after[..end].to_string();
        }
    }
    String::new()
}

/// Extract INTERNALDATE from FETCH response.
/// Format: INTERNALDATE "16-Feb-2026 12:00:00 +0000"
/// Returns None if not present — mail-parser will use the Date header instead.
fn extract_internal_date(line: &str) -> Option<i64> {
    let idx = line.find("INTERNALDATE \"")?;
    let after = &line[idx + 14..];
    let end = after.find('"')?;
    let date_str = &after[..end];
    // Parse "DD-Mon-YYYY HH:MM:SS +ZZZZ" manually
    parse_imap_date(date_str)
}

/// Parse IMAP date format "16-Feb-2026 12:00:00 +0000" to Unix timestamp.
fn parse_imap_date(s: &str) -> Option<i64> {
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.len() < 2 { return None; }

    // "16-Feb-2026"
    let date_parts: Vec<&str> = parts[0].split('-').collect();
    if date_parts.len() != 3 { return None; }

    let day: u32 = date_parts[0].parse().ok()?;
    let month = match date_parts[1].to_lowercase().as_str() {
        "jan" => 1u32, "feb" => 2, "mar" => 3, "apr" => 4,
        "may" => 5, "jun" => 6, "jul" => 7, "aug" => 8,
        "sep" => 9, "oct" => 10, "nov" => 11, "dec" => 12,
        _ => return None,
    };
    let year: i64 = date_parts[2].parse().ok()?;

    // "12:00:00"
    let time_parts: Vec<&str> = parts.get(1)?.split(':').collect();
    if time_parts.len() != 3 { return None; }
    let hour: i64 = time_parts[0].parse().ok()?;
    let minute: i64 = time_parts[1].parse().ok()?;
    let second: i64 = time_parts[2].parse().ok()?;

    // Timezone offset "+0000" (optional)
    let tz_offset_secs: i64 = if let Some(tz) = parts.get(2) {
        let sign = if tz.starts_with('-') { -1i64 } else { 1i64 };
        let tz_num = tz.trim_start_matches(['+', '-']);
        if tz_num.len() == 4 {
            let tz_h: i64 = tz_num[..2].parse().unwrap_or(0);
            let tz_m: i64 = tz_num[2..].parse().unwrap_or(0);
            sign * (tz_h * 3600 + tz_m * 60)
        } else { 0 }
    } else { 0 };

    // Convert to Unix timestamp (days since epoch)
    // Simplified: use a basic calendar calculation
    let mut days: i64 = 0;
    for y in 1970..year {
        days += if is_leap_year(y) { 366 } else { 365 };
    }
    let month_days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for m in 1..month {
        days += month_days[m as usize] as i64;
        if m == 2 && is_leap_year(year) { days += 1; }
    }
    days += day as i64 - 1;

    Some(days * 86400 + hour * 3600 + minute * 60 + second - tz_offset_secs)
}

fn is_leap_year(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0)
}

/// Extract literal size from a line ending with {1234}\r\n
fn extract_literal_size(line: &str) -> Option<usize> {
    let trimmed = line.trim_end();
    if !trimmed.ends_with('}') {
        return None;
    }
    let brace_start = trimmed.rfind('{')?;
    trimmed[brace_start + 1..trimmed.len() - 1].parse().ok()
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
        "inbox" => Some("\\Inbox".to_string()),
        "sent" | "sent messages" | "sent items" | "[gmail]/sent mail" => {
            Some("\\Sent".to_string())
        }
        "trash" | "deleted" | "deleted items" | "deleted messages" | "bin" | "corbeille"
        | "unsolbox" | "[gmail]/trash" => {
            Some("\\Trash".to_string())
        }
        "drafts" | "draft" | "draftbox" | "brouillons" | "[gmail]/drafts" => Some("\\Drafts".to_string()),
        "junk" | "spam" | "junk e-mail" | "[gmail]/spam" => Some("\\Junk".to_string()),
        "archive" | "archives" | "[gmail]/all mail" => Some("\\Archive".to_string()),
        _ => None,
    }
}

/// Parse a raw email message into our ImapMessage struct.
///
/// `internal_date`: optional INTERNALDATE timestamp from the IMAP server,
/// used as fallback when the Date header cannot be parsed.
fn parse_message(
    parser: &MessageParser,
    raw: &[u8],
    uid: u32,
    folder: &str,
    raw_size: u32,
    is_read: bool,
    is_starred: bool,
    is_draft: bool,
    internal_date: Option<i64>,
) -> Result<ImapMessage, String> {
    let message = parser.parse(raw).ok_or("Failed to parse MIME message")?;

    let message_id = message.message_id().map(|s| s.to_string());
    let subject = message.subject().map(|s| s.to_string());
    let date = message
        .date()
        .map(|d| d.to_timestamp())
        .or(internal_date)
        .unwrap_or(0);

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

    // Build a map from mail-parser part index → IMAP MIME section path.
    // IMAP numbers children of multipart containers starting at 1 (e.g. "1", "2", "1.2.3").
    // mail-parser stores all parts flat in a Vec, with Multipart variants holding child indices.
    let section_map = build_imap_section_map(&message);

    log::debug!(
        "IMAP parse UID {uid}: {} parts, {} attachment indices {:?}, section_map: {:?}",
        message.parts.len(),
        message.attachments.len(),
        message.attachments,
        section_map,
    );

    // Attachments
    let attachments: Vec<ImapAttachment> = message
        .attachments
        .iter()
        .filter_map(|&part_idx| {
            let att = message.parts.get(part_idx)?;
            let section = match section_map.get(&part_idx) {
                Some(s) => s.clone(),
                None => {
                    log::warn!(
                        "IMAP UID {uid}: attachment at part index {part_idx} not found in section map (map has {} entries)",
                        section_map.len(),
                    );
                    return None;
                }
            };

            let mime_type = att
                .content_type()
                .map(|ct| {
                    let ctype = ct.ctype();
                    let subtype = ct.subtype().unwrap_or("octet-stream");
                    format!("{ctype}/{subtype}")
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());

            Some(ImapAttachment {
                part_id: section,
                filename: att
                    .attachment_name()
                    .unwrap_or("attachment")
                    .to_string(),
                mime_type,
                size: att.len() as u32,
                content_id: att.content_id().map(|s| s.to_string()),
                is_inline: att.content_disposition().map_or(false, |cd| cd.is_inline()),
            })
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

/// Build a mapping from mail-parser part index → IMAP MIME section path string.
///
/// IMAP section numbering: children of a multipart container are numbered 1, 2, 3, ...
/// Nested multipart children get dot-separated paths (e.g., "1.2" for the 2nd child of the 1st child).
/// For non-multipart messages, the single body is section "1".
fn build_imap_section_map(message: &mail_parser::Message) -> std::collections::HashMap<usize, String> {
    use mail_parser::PartType;

    let mut map = std::collections::HashMap::new();

    fn walk(
        parts: &[mail_parser::MessagePart],
        part_idx: usize,
        prefix: &str,
        map: &mut std::collections::HashMap<usize, String>,
    ) {
        if let Some(part) = parts.get(part_idx) {
            if let PartType::Multipart(children) = &part.body {
                for (i, &child_idx) in children.iter().enumerate() {
                    let section = if prefix.is_empty() {
                        format!("{}", i + 1)
                    } else {
                        format!("{}.{}", prefix, i + 1)
                    };
                    walk(parts, child_idx, &section, map);
                }
            } else {
                // Leaf part — use the section path as-is
                let section = if prefix.is_empty() {
                    // Non-multipart message: the body is section "1"
                    "1".to_string()
                } else {
                    prefix.to_string()
                };
                map.insert(part_idx, section);
            }
        }
    }

    // Start from part 0 (root) with empty prefix
    if !message.parts.is_empty() {
        walk(&message.parts, 0, "", &mut map);
    }

    map
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
