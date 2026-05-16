#[cfg(any(target_os = "macos", target_os = "linux"))]
extern crate tikv_jemalloc_sys;

use tauri::Manager;

use crate::imap::client as imap_client;
use crate::imap::pool::ImapSessionPool;
use crate::imap::types::{
    BodyCache, BodyEntry, CidImageRequest, CidImageResult, DeltaCheckRequest, DeltaCheckResult,
    GmailAttachment, GmailMessage, GmailStoredHeader, ImapConfig, ImapFetchResult,
    ImapFetchResultMeta, ImapFolder, ImapFolderSearchResult, ImapFolderStatus, ImapFolderSyncResult,
    ImapMessage, ImapMessageMeta, ImapSyncHeader, ImapThreadUpdate, SyncSemaphore,
};
use crate::smtp::client as smtp_client;
use crate::smtp::types::{SmtpConfig, SmtpSendResult};

// ---------- IMAP commands ----------

#[tauri::command]
pub async fn imap_test_connection(config: ImapConfig) -> Result<String, String> {
    imap_client::test_connection(&config).await
}

#[tauri::command]
pub async fn imap_list_folders(config: ImapConfig) -> Result<Vec<ImapFolder>, String> {
    let mut session = imap_client::connect(&config).await?;
    let folders = imap_client::list_folders(&mut session).await?;
    let _ = session.logout().await;
    Ok(folders)
}

#[tauri::command]
pub async fn imap_fetch_messages(
    pool: tauri::State<'_, ImapSessionPool>,
    sync_semaphore: tauri::State<'_, SyncSemaphore>,
    config: ImapConfig,
    folder: String,
    uids: Vec<u32>,
) -> Result<ImapFetchResult, String> {
    if uids.is_empty() {
        return Err("No UIDs provided".to_string());
    }
    log::debug!("[imap_fetch_messages: folder={folder} uids={}", uids.len());

    let _permit = sync_semaphore.semaphore.acquire().await
        .map_err(|e| format!("semaphore acquire: {e}"))?;

    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let (mut session, key) = pool.acquire(&config).await?;
    let result = imap_client::fetch_messages(&mut session, &folder, &uid_set).await;

    match result {
        Ok(r) => {
            pool.release(key, session).await;
            Ok(r)
        }
        Err(e) if e.starts_with("ASYNC_IMAP_EMPTY:") => {
            // async-imap failed, fallback to raw TCP (doesn't use pool)
            log::info!("Falling back to raw TCP fetch for folder {folder}");
            imap_client::raw_fetch_messages(&config, &folder, &uid_set).await
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn imap_fetch_new_uids(
    config: ImapConfig,
    folder: String,
    since_uid: u32,
) -> Result<Vec<u32>, String> {
    let mut session = imap_client::connect(&config).await?;
    let uids = imap_client::fetch_new_uids(&mut session, &folder, since_uid).await?;
    let _ = session.logout().await;
    Ok(uids)
}

#[tauri::command]
pub async fn imap_search_all_uids(
    config: ImapConfig,
    folder: String,
) -> Result<Vec<u32>, String> {
    let mut session = imap_client::connect(&config).await?;
    let uids = imap_client::search_all_uids(&mut session, &folder).await?;
    let _ = session.logout().await;
    Ok(uids)
}

#[tauri::command]
pub async fn imap_fetch_message_body(
    sync_semaphore: tauri::State<'_, SyncSemaphore>,
    config: ImapConfig,
    folder: String,
    uid: u32,
) -> Result<ImapMessage, String> {
    log::debug!("[imap_fetch_message_body: folder={folder} uid={uid}");
    let _permit = sync_semaphore.semaphore.acquire().await
        .map_err(|e| format!("semaphore acquire: {e}"))?;

    let mut session = imap_client::connect(&config).await?;
    let message = imap_client::fetch_message_body(&mut session, &folder, uid).await?;
    let _ = session.logout().await;
    Ok(message)
}

#[tauri::command]
pub async fn imap_fetch_raw_message(
    config: ImapConfig,
    folder: String,
    uid: u32,
) -> Result<String, String> {
    let mut session = imap_client::connect(&config).await?;
    let raw = imap_client::fetch_raw_message(&mut session, &folder, uid).await?;
    let _ = session.logout().await;
    Ok(raw)
}

#[tauri::command]
pub async fn imap_set_flags(
    config: ImapConfig,
    folder: String,
    uids: Vec<u32>,
    flags: Vec<String>,
    add: bool,
) -> Result<(), String> {
    if uids.is_empty() {
        return Ok(());
    }

    let mut session = imap_client::connect(&config).await?;

    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let flag_op = if add { "+FLAGS" } else { "-FLAGS" };

    // Format flags like "(\Seen \Flagged)"
    let flags_str = format!(
        "({})",
        flags
            .iter()
            .map(|f| {
                // Ensure flags have the backslash prefix if they're standard flags
                if f.starts_with('\\') {
                    f.clone()
                } else {
                    format!("\\{f}")
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    );

    imap_client::set_flags(&mut session, &folder, &uid_set, flag_op, &flags_str).await?;
    let _ = session.logout().await;
    Ok(())
}

#[tauri::command]
pub async fn imap_move_messages(
    config: ImapConfig,
    folder: String,
    uids: Vec<u32>,
    destination: String,
) -> Result<(), String> {
    if uids.is_empty() {
        return Ok(());
    }

    let mut session = imap_client::connect(&config).await?;

    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    imap_client::move_messages(&mut session, &folder, &uid_set, &destination).await?;
    let _ = session.logout().await;
    Ok(())
}

#[tauri::command]
pub async fn imap_delete_messages(
    config: ImapConfig,
    folder: String,
    uids: Vec<u32>,
) -> Result<(), String> {
    if uids.is_empty() {
        return Ok(());
    }

    let mut session = imap_client::connect(&config).await?;

    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    imap_client::delete_messages(&mut session, &folder, &uid_set).await?;
    let _ = session.logout().await;
    Ok(())
}

#[tauri::command]
pub async fn imap_get_folder_status(
    config: ImapConfig,
    folder: String,
) -> Result<ImapFolderStatus, String> {
    let mut session = imap_client::connect(&config).await?;
    let status = imap_client::get_folder_status(&mut session, &folder).await?;
    let _ = session.logout().await;
    Ok(status)
}

#[tauri::command]
pub async fn imap_fetch_attachment(
    pool: tauri::State<'_, ImapSessionPool>,
    config: ImapConfig,
    folder: String,
    uid: u32,
    part_id: String,
) -> Result<String, String> {
    log::debug!("[imap_fetch_attachment: folder={folder} uid={uid} part={part_id}");
    let t0 = std::time::Instant::now();
    let (mut session, key) = pool.acquire(&config).await?;
    log::debug!("[CID-DBG] pool.acquire in {}ms key={key}", t0.elapsed().as_millis());

    match imap_client::fetch_attachment(&mut session, &folder, uid, &part_id).await {
        Ok(data) => {
            log::debug!("[CID-DBG] fetch OK in {}ms uid={uid} part={part_id}", t0.elapsed().as_millis());
            pool.release(key, session).await;
            Ok(data)
        }
        Err(e) => {
            // Don't return session on error — it may be in a broken state.
            log::warn!("[CID-DBG] fetch failed in {}ms uid={uid} part={part_id}: {e}", t0.elapsed().as_millis());
            Err(e)
        }
    }
}

/// Background attachment pre-caching: fetch from IMAP and write to disk entirely in Rust.
/// The binary data never crosses the WKWebView IPC bridge, which prevents the ~70MB-per-MB
/// memory explosion caused by base64 JSON serialisation over XPC.
#[tauri::command]
pub async fn imap_cache_attachment(
    app: tauri::AppHandle,
    pool: tauri::State<'_, ImapSessionPool>,
    config: ImapConfig,
    message_id: String,
    part_id: String,
    attachment_db_id: String,
) -> Result<u32, String> {
    use base64::Engine;

    // Look up imap_folder + imap_uid stored in the messages table.
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("velo.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;

    let (folder, uid): (String, u32) = conn
        .query_row(
            "SELECT imap_folder, imap_uid FROM messages WHERE id = ?1",
            rusqlite::params![message_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?)),
        )
        .map_err(|e| format!("message not found or missing IMAP metadata: {e}"))?;

    // Fetch the attachment body via IMAP — result is a base64 string (stays in Rust).
    let (mut session, key) = pool.acquire(&config).await?;
    let base64_str = match imap_client::fetch_attachment(&mut session, &folder, uid, &part_id).await {
        Ok(s) => { pool.release(key, session).await; s }
        Err(e) => return Err(e),
    };

    // Decode base64 → raw bytes (still in Rust, never touches WKWebView).
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_str.as_bytes())
        .map_err(|e| format!("base64 decode failed: {e}"))?;
    let size = bytes.len() as u32;

    // Write to AppData/attachment_cache/{hash}.
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data.join("attachment_cache");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("create cache dir: {e}"))?;

    let file_name = djb2_hash(&attachment_db_id);
    let rel_path = format!("attachment_cache/{file_name}");
    std::fs::write(app_data.join(&rel_path), &bytes)
        .map_err(|e| format!("write attachment cache: {e}"))?;

    // Update attachments table — mirrors what cacheManager.ts does from JS.
    conn.execute(
        "UPDATE attachments SET local_path = ?1, cached_at = unixepoch(), cache_size = ?2 WHERE id = ?3",
        rusqlite::params![rel_path, size as i64, attachment_db_id],
    )
    .map_err(|e| format!("DB update failed: {e}"))?;

    Ok(size)
}

/// Map MIME type to a file extension so WebKit can skip MIME sniffing and route
/// the asset through CoreGraphics hardware acceleration immediately.
fn mime_to_ext(mime: Option<&str>) -> &'static str {
    match mime {
        Some(m) if m.starts_with("image/jpeg") || m.starts_with("image/jpg") => ".jpg",
        Some(m) if m.starts_with("image/png")  => ".png",
        Some(m) if m.starts_with("image/gif")  => ".gif",
        Some(m) if m.starts_with("image/webp") => ".webp",
        Some(m) if m.starts_with("image/svg")  => ".svg",
        _ => ".img",
    }
}

/// Force jemalloc to immediately return all dirty pages to the OS via MADV_DONTNEED.
/// Counteracts macOS MADV_FREE behaviour where freed pages stay in physical footprint
/// until the OS decides to reclaim them (which it doesn't under abundant RAM).
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn jemalloc_purge_all() {
    // arena index 4294967295 == MALLCTL_ARENAS_ALL — applies to every arena
    unsafe {
        tikv_jemalloc_sys::mallctl(
            b"arena.4294967295.purge\0".as_ptr() as *const _,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
        );
    }
}
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn jemalloc_purge_all() {}

/// DJB2 double-hash → base-36 filename, matching the JS `hashFileName()` in cacheManager.ts.
fn djb2_hash(id: &str) -> String {
    let mut h1: u32 = 5381;
    let mut h2: u32 = 52711;
    for cu in id.encode_utf16() {
        let cu = cu as u32;
        h1 = h1.wrapping_mul(33) ^ cu;
        h2 = h2.wrapping_mul(33) ^ cu;
    }
    format!("{}_{}", to_base36(h1), to_base36(h2))
}

fn to_base36(mut n: u32) -> String {
    if n == 0 { return "0".to_string(); }
    let digits: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(digits[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).unwrap()
}

/// Fetch and cache all CID inline images for one email in a single Rust command.
///
/// By processing all images inside one `async fn` we stay on (mostly) the same
/// Tokio thread throughout, which means a single jemalloc arena is used for every
/// iteration. Pages freed after iteration N are reused by iteration N+1 — the
/// physical-memory footprint is O(max_image_size), not O(sum_of_all_images).
///
/// JS receives only local file paths (strings); binary data never crosses the
/// WKWebView XPC bridge.
#[tauri::command]
pub async fn imap_batch_resolve_cid_images(
    app: tauri::AppHandle,
    pool: tauri::State<'_, ImapSessionPool>,
    config: ImapConfig,
    requests: Vec<CidImageRequest>,
) -> Result<Vec<CidImageResult>, String> {
    if requests.is_empty() {
        return Ok(vec![]);
    }

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("velo.db");
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data.join("attachment_cache");
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("create cache dir: {e}"))?;

    // rusqlite::Connection contains RefCell (not Sync) so it must never be held
    // across an .await point. We open it once and use it only in synchronous sections
    // (before and after each async IMAP fetch) to satisfy the Send bound on the future.
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;

    let mut results: Vec<CidImageResult> = Vec::with_capacity(requests.len());

    for req in &requests {
        // --- Phase 1: synchronous DB lookup (no await, conn safe to use) ---
        let lookup: Result<(String, u32), String> = conn
            .query_row(
                "SELECT imap_folder, imap_uid FROM messages WHERE id = ?1",
                rusqlite::params![req.message_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?)),
            )
            .map_err(|e| format!("message lookup: {e}"));

        let (folder, uid) = match lookup {
            Ok(v) => v,
            Err(e) => { log::warn!("[CID] skip {}: {e}", req.attachment_db_id); continue; }
        };

        // --- Phase 2: async IMAP fetch (conn NOT held across these awaits) ---
        let (mut session, key) = match pool.acquire(&config).await {
            Ok(v) => v,
            Err(e) => { log::warn!("[CID] skip {}: {e}", req.attachment_db_id); continue; }
        };
        // Always release before doing anything else — even on error.
        let fetch_result =
            imap_client::fetch_attachment(&mut session, &folder, uid, &req.part_id).await;
        pool.release(key, session).await;

        let base64_str = match fetch_result {
            Ok(s) => s,
            Err(e) => { log::warn!("[CID] skip {}: {e}", req.attachment_db_id); continue; }
        };

        // --- Phase 3: synchronous decode + write + DB update (no await, conn safe) ---
        let outcome: Result<CidImageResult, String> = (|| {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(base64_str.as_bytes())
                .map_err(|e| format!("base64 decode: {e}"))?;
            drop(base64_str); // explicit early free before the write allocation
            let size = bytes.len() as u32;

            // Include MIME-derived extension so WebKit identifies the image type
            // immediately (CoreGraphics fast-path) without MIME sniffing the raw bytes.
            let ext = mime_to_ext(req.mime_type.as_deref());
            let file_name = djb2_hash(&req.attachment_db_id);
            let rel_path = format!("attachment_cache/{file_name}{ext}");
            std::fs::write(app_data.join(&rel_path), &bytes)
                .map_err(|e| format!("write cache: {e}"))?;
            drop(bytes); // explicit early free — pages now available to jemalloc

            conn.execute(
                "UPDATE attachments SET local_path = ?1, cached_at = unixepoch(), cache_size = ?2 WHERE id = ?3",
                rusqlite::params![rel_path, size as i64, req.attachment_db_id],
            )
            .map_err(|e| format!("DB update: {e}"))?;

            Ok(CidImageResult {
                attachment_db_id: req.attachment_db_id.clone(),
                local_path: rel_path,
            })
        })();

        match outcome {
            Ok(r) => results.push(r),
            Err(e) => log::warn!("[CID] skip {}: {e}", req.attachment_db_id),
        }

        // Force jemalloc to return dirty pages to OS via MADV_DONTNEED after every
        // image. Counteracts macOS MADV_FREE: without this, freed pages from iteration
        // N accumulate in physical footprint even though Rust has dropped the data.
        jemalloc_purge_all();
    }

    Ok(results)
}

#[tauri::command]
pub async fn imap_append_message(
    config: ImapConfig,
    folder: String,
    flags: Option<String>,
    raw_message: String,
) -> Result<u32, String> {
    let mut session = imap_client::connect(&config).await?;

    // raw_message is base64url-encoded; decode it
    let raw_bytes = base64url_decode(&raw_message)?;

    let flags_ref = flags.as_deref();
    let uid = imap_client::append_message(&mut session, &folder, flags_ref, &raw_bytes).await?;
    let _ = session.logout().await;
    Ok(uid)
}

fn base64url_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    engine
        .decode(input)
        .map_err(|e| format!("base64url decode failed: {e}"))
}

#[tauri::command]
pub async fn imap_search_folder(
    config: ImapConfig,
    folder: String,
    since_date: Option<String>,
) -> Result<ImapFolderSearchResult, String> {
    let mut session = imap_client::connect(&config).await?;
    let result = imap_client::search_folder(&mut session, &folder, since_date).await;
    let _ = session.logout().await;
    result
}

#[tauri::command]
pub async fn imap_sync_folder(
    sync_semaphore: tauri::State<'_, SyncSemaphore>,
    config: ImapConfig,
    folder: String,
    batch_size: u32,
    since_date: Option<String>,
) -> Result<ImapFolderSyncResult, String> {
    // Phase 1: Implementazione Backpressure (Semafori)
    let _permit = sync_semaphore.semaphore.acquire().await
        .map_err(|e| format!("semaphore acquire: {e}"))?;

    let mut session = imap_client::connect(&config).await?;
    let result = imap_client::sync_folder(&mut session, &folder, batch_size, since_date).await;
    let _ = session.logout().await;
    result
}

#[tauri::command]
pub async fn imap_raw_fetch_diagnostic(
    config: ImapConfig,
    folder: String,
    uid_range: String,
) -> Result<String, String> {
    imap_client::raw_fetch_diagnostic(&config, &folder, &uid_range).await
}

#[tauri::command]
pub async fn imap_delta_check(
    config: ImapConfig,
    folders: Vec<DeltaCheckRequest>,
) -> Result<Vec<DeltaCheckResult>, String> {
    log::debug!("[imap_delta_check: {} folders", folders.len());
    let mut session = imap_client::connect(&config).await?;
    let results = imap_client::delta_check_folders(&mut session, &folders).await?;
    let _ = session.logout().await;
    Ok(results)
}

/// Fetch messages from IMAP but keep body_html in a Rust-side BodyCache.
/// Returns ImapFetchResultMeta (no body_html) over the Tauri IPC bridge so
/// WebKit never has to deserialise multi-megabyte HTML strings.
/// After writing the message metadata to SQLite, call imap_flush_bodies to
/// have Rust write the HTML bodies directly from the cache into the DB.
#[tauri::command]
pub async fn imap_fetch_messages_buffered(
    pool: tauri::State<'_, ImapSessionPool>,
    body_cache: tauri::State<'_, BodyCache>,
    sync_semaphore: tauri::State<'_, SyncSemaphore>,
    config: ImapConfig,
    folder: String,
    uids: Vec<u32>,
) -> Result<ImapFetchResultMeta, String> {
    if uids.is_empty() {
        return Err("No UIDs provided".to_string());
    }
    log::debug!("[imap_fetch_messages_buffered: folder={folder} uids={}", uids.len());

    let _permit = sync_semaphore.semaphore.acquire().await
        .map_err(|e| format!("semaphore acquire: {e}"))?;

    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let (mut session, key) = pool.acquire(&config).await?;
    let result = imap_client::fetch_messages(&mut session, &folder, &uid_set).await;

    let fetch_result: ImapFetchResult = match result {
        Ok(r) => {
            pool.release(key, session).await;
            r
        }
        Err(e) if e.starts_with("ASYNC_IMAP_EMPTY:") => {
            log::info!("Falling back to raw TCP fetch for folder {folder} (buffered)");
            imap_client::raw_fetch_messages(&config, &folder, &uid_set).await?
        }
        Err(e) => return Err(e),
    };

    let mut meta_messages = Vec::with_capacity(fetch_result.messages.len());
    {
        let mut cache = body_cache
            .lock()
            .map_err(|e| format!("body cache lock: {e}"))?;

        for msg in fetch_result.messages.into_iter() {
            if msg.body_html.is_some() || msg.body_text.is_some() {
                cache.insert(
                    (msg.folder.clone(), msg.uid),
                    BodyEntry {
                        body_html: msg.body_html,
                        body_text: msg.body_text,
                    },
                );
            }

            meta_messages.push(ImapMessageMeta {
                uid: msg.uid,
                folder: msg.folder,
                message_id: msg.message_id,
                in_reply_to: msg.in_reply_to,
                references: msg.references,
                from_address: msg.from_address,
                from_name: msg.from_name,
                to_addresses: msg.to_addresses,
                cc_addresses: msg.cc_addresses,
                bcc_addresses: msg.bcc_addresses,
                reply_to: msg.reply_to,
                subject: msg.subject,
                date: msg.date,
                is_read: msg.is_read,
                is_starred: msg.is_starred,
                is_draft: msg.is_draft,
                snippet: msg.snippet,
                raw_size: msg.raw_size,
                list_unsubscribe: msg.list_unsubscribe,
                list_unsubscribe_post: msg.list_unsubscribe_post,
                auth_results: msg.auth_results,
                attachments: msg.attachments,
            });
        }
    }

    Ok(ImapFetchResultMeta {
        messages: meta_messages,
        folder_status: fetch_result.folder_status,
    })
}

/// Drain body_html + body_text for the given (folder, uid) pairs from BodyCache and
/// write them directly to SQLite via rusqlite — no WebKit involved on either path.
/// Must be called (and awaited) after TypeScript has upserted the message metadata rows.
/// Returns the number of rows updated.
#[tauri::command]
pub async fn imap_flush_bodies(
    app: tauri::AppHandle,
    body_cache: tauri::State<'_, BodyCache>,
    account_id: String,
    folder: String,
    uids: Vec<u32>,
) -> Result<u32, String> {
    if uids.is_empty() {
        return Ok(0);
    }

    // Drain the requested entries; unknown UIDs (skipped/deduped) are silently ignored.
    let entries: Vec<(u32, BodyEntry)> = {
        let mut cache = body_cache
            .lock()
            .map_err(|e| format!("body cache lock: {e}"))?;
        uids.iter()
            .filter_map(|&uid| cache.remove(&(folder.clone(), uid)).map(|e| (uid, e)))
            .collect()
    };

    if entries.is_empty() {
        return Ok(0);
    }

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("velo.db");

    // WAL mode: one writer at a time, but readers are never blocked.
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;

    // Phase 2: SQLite Sink Optimization
    conn.execute_batch(
        "PRAGMA cache_size = -2000; \
         PRAGMA journal_mode = WAL; \
         PRAGMA synchronous = NORMAL;"
    ).map_err(|e| e.to_string())?;

    let mut count = 0u32;
    for (uid, entry) in entries {
        let message_id = format!("imap-{account_id}-{folder}-{uid}");
        let rows = conn
            .execute(
                // COALESCE mirrors the TypeScript upsertMessage pattern:
                // only overwrite if the existing DB value is NULL.
                "UPDATE messages \
                 SET body_html = COALESCE(?1, body_html), \
                     body_text = COALESCE(?2, body_text) \
                 WHERE id = ?3 AND account_id = ?4",
                rusqlite::params![entry.body_html, entry.body_text, message_id, account_id],
            )
            .map_err(|e| format!("flush body uid {uid}: {e}"))?;
        if rows > 0 {
            count += 1;
        }
    }

    log::debug!("[imap_flush_bodies] Wrote {count} HTML bodies for folder={folder} account={account_id}");
    Ok(count)
}

// ---------- Zero-IPC sync commands ----------
// These commands fetch from IMAP and write ALL SQL via rusqlite,
// so WebKit never receives or allocates memory for message content.

/// Fetch a batch of messages from IMAP and write thread placeholders, messages (with full
/// body_html + body_text), and attachments directly to SQLite via rusqlite.
/// Returns only the minimal `ImapSyncHeader` slice needed for JWZ threading (~200 B/msg).
/// WebKit IPC traffic per batch: ~1-2 KB regardless of message body size.
#[tauri::command]
pub async fn imap_fetch_and_store(
    app: tauri::AppHandle,
    pool: tauri::State<'_, ImapSessionPool>,
    sync_semaphore: tauri::State<'_, SyncSemaphore>,
    config: ImapConfig,
    account_id: String,
    folder: String,
    label_id: String,
    uids: Vec<u32>,
    cutoff_date: i64, // Unix timestamp in seconds; 0 = no cutoff
) -> Result<Vec<ImapSyncHeader>, String> {
    if uids.is_empty() {
        return Ok(vec![]);
    }
    log::debug!("[imap_fetch_and_store: folder={folder} uids={}", uids.len());

    let _permit = sync_semaphore.semaphore.acquire().await
        .map_err(|e| format!("semaphore acquire: {e}"))?;

    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    // Fetch full messages (body_html + body_text) from IMAP.
    let (mut session, key) = pool.acquire(&config).await?;
    let fetch_result: ImapFetchResult =
        match imap_client::fetch_messages(&mut session, &folder, &uid_set).await {
            Ok(r) => {
                pool.release(key, session).await;
                r
            }
            Err(e) if e.starts_with("ASYNC_IMAP_EMPTY:") => {
                log::info!("imap_fetch_and_store: raw TCP fallback for {folder}");
                imap_client::raw_fetch_messages(&config, &folder, &uid_set).await?
            }
            Err(e) => return Err(e),
        };

    // Open rusqlite — WAL mode means no conflict with the Tauri SQL plugin reader pool.
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("velo.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;
    
    // Phase 2: SQLite Sink Optimization
    conn.execute_batch(
        "PRAGMA cache_size = -2000; \
         PRAGMA journal_mode = WAL; \
         PRAGMA synchronous = NORMAL;"
    ).map_err(|e| e.to_string())?;

    // Load tombstones for this folder (deleted messages we must not re-import).
    // Keep stmt alive until after collect() so the borrow on conn is released cleanly.
    let mut tombstone_stmt = conn
        .prepare("SELECT uid FROM deleted_imap_uids WHERE account_id = ?1 AND folder_path = ?2")
        .map_err(|e| e.to_string())?;
    let tombstones: std::collections::HashSet<u32> = tombstone_stmt
        .query_map(rusqlite::params![account_id, folder], |r| r.get::<_, u32>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    drop(tombstone_stmt);

    // Load existing RFC message IDs for this batch to detect cross-folder duplicates.
    let rfc_ids_in_batch: Vec<String> = fetch_result
        .messages
        .iter()
        .filter_map(|m| m.message_id.clone())
        .collect();
    let existing_rfc_ids: std::collections::HashSet<String> = if rfc_ids_in_batch.is_empty() {
        std::collections::HashSet::new()
    } else {
        let placeholders = (2..=rfc_ids_in_batch.len() + 1)
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT message_id_header FROM messages \
             WHERE account_id = ?1 AND message_id_header IN ({placeholders})"
        );
        let mut rfc_stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut params: Vec<rusqlite::types::Value> =
            vec![rusqlite::types::Value::Text(account_id.clone())];
        for id in &rfc_ids_in_batch {
            params.push(rusqlite::types::Value::Text(id.clone()));
        }
        let result: std::collections::HashSet<String> = rfc_stmt
            .query_map(rusqlite::params_from_iter(params.iter()), |r| {
                r.get::<_, String>(0)
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(rfc_stmt);
        result
    };

    let mut headers: Vec<ImapSyncHeader> = Vec::with_capacity(fetch_result.messages.len());

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    for msg in fetch_result.messages.into_iter() {
        // Filter 1: tombstone
        if tombstones.contains(&msg.uid) {
            continue;
        }

        let is_read = msg.is_read || msg.is_draft || label_id == "TRASH";
        let snippet = msg.snippet.unwrap_or_default();
        let has_attachments = !msg.attachments.is_empty();
        let local_id = format!("imap-{account_id}-{}-{}", msg.folder, msg.uid);
        let synthetic_rfc_id = || {
            format!(
                "synthetic-{account_id}-{}-{}@velo.local",
                msg.folder, msg.uid
            )
        };
        let rfc_id_for_header = msg.message_id.clone().unwrap_or_else(synthetic_rfc_id);

        // Filter 2: dedup by RFC message ID (message exists in another folder already)
        let stored = if msg.message_id.as_ref().map_or(false, |id| existing_rfc_ids.contains(id)) {
            false // duplicate — return header so TypeScript can accumulate cross-folder labels
        } else {
            // Filter 3: date cutoff
            if cutoff_date > 0 && msg.date > 0 && msg.date < cutoff_date {
                false
            } else {
                // Write placeholder thread (thread_id = local_id; updated by imap_store_threads)
                conn.execute(
                    "INSERT INTO threads \
                     (id, account_id, subject, snippet, last_message_at, message_count, \
                      is_read, is_starred, is_important, has_attachments) \
                     VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, 0, ?8) \
                     ON CONFLICT(account_id, id) DO UPDATE SET \
                       subject=?3, snippet=?4, last_message_at=?5, \
                       is_read=?6, is_starred=?7, has_attachments=?8",
                    rusqlite::params![
                        local_id,
                        account_id,
                        msg.subject,
                        snippet,
                        msg.date,
                        is_read as i32,
                        msg.is_starred as i32,
                        has_attachments as i32,
                    ],
                )
                .map_err(|e| format!("thread insert uid {}: {e}", msg.uid))?;

                // Write message with body_html + body_text directly (no IPC, no BodyCache)
                conn.execute(
                    "INSERT INTO messages \
                     (id, account_id, thread_id, from_address, from_name, to_addresses, \
                      cc_addresses, bcc_addresses, reply_to, subject, snippet, date, is_read, \
                      is_starred, body_html, body_text, body_cached, raw_size, internal_date, \
                      list_unsubscribe, list_unsubscribe_post, auth_results, message_id_header, \
                      references_header, in_reply_to_header, imap_uid, imap_folder) \
                     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,\
                             ?19,?20,?21,?22,?23,?24,?25,?26,?27) \
                     ON CONFLICT(account_id, id) DO UPDATE SET \
                       from_address=?4, from_name=?5, to_addresses=?6, cc_addresses=?7, \
                       bcc_addresses=?8, reply_to=?9, subject=?10, snippet=?11, date=?12, \
                       is_read=?13, is_starred=?14, \
                       body_html=COALESCE(?15, body_html), \
                       body_text=COALESCE(?16, body_text), \
                       body_cached=CASE WHEN ?15 IS NOT NULL THEN 1 ELSE body_cached END, \
                       raw_size=?18, internal_date=?19, list_unsubscribe=?20, \
                       list_unsubscribe_post=?21, auth_results=?22, \
                       message_id_header=COALESCE(?23, message_id_header), \
                       references_header=COALESCE(?24, references_header), \
                       in_reply_to_header=COALESCE(?25, in_reply_to_header), \
                       imap_uid=COALESCE(?26, imap_uid), \
                       imap_folder=COALESCE(?27, imap_folder)",
                    rusqlite::params![
                        local_id,
                        account_id,
                        local_id, // placeholder thread_id
                        msg.from_address,
                        msg.from_name,
                        msg.to_addresses,
                        msg.cc_addresses,
                        msg.bcc_addresses,
                        msg.reply_to,
                        msg.subject,
                        snippet,
                        msg.date,
                        is_read as i32,
                        msg.is_starred as i32,
                        msg.body_html,
                        msg.body_text,
                        msg.body_html.is_some() as i32,
                        msg.raw_size,
                        msg.date, // internal_date = date for IMAP
                        msg.list_unsubscribe,
                        msg.list_unsubscribe_post,
                        msg.auth_results,
                        msg.message_id,
                        msg.references,
                        msg.in_reply_to,
                        msg.uid,
                        msg.folder,
                    ],
                )
                .map_err(|e| format!("message insert uid {}: {e}", msg.uid))?;

                // Write attachments
                for att in msg.attachments {
                    let att_id = format!("{local_id}_{}", att.part_id);
                    conn.execute(
                        "INSERT INTO attachments \
                         (id, message_id, account_id, filename, mime_type, size, \
                          gmail_attachment_id, imap_part_id, content_id, is_inline) \
                         VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,?8,?9) \
                         ON CONFLICT(id) DO UPDATE SET \
                           filename=?4, mime_type=?5, size=?6, \
                           imap_part_id=?7, content_id=?8, is_inline=?9",
                        rusqlite::params![
                            att_id,
                            local_id,
                            account_id,
                            att.filename,
                            att.mime_type,
                            att.size,
                            att.part_id,
                            att.content_id,
                            att.is_inline as i32,
                        ],
                    )
                    .map_err(|e| format!("attachment insert uid {}: {e}", msg.uid))?;
                }
                true
            }
        };

        headers.push(ImapSyncHeader {
            local_id,
            message_id: rfc_id_for_header.into(),
            in_reply_to: msg.in_reply_to,
            references: msg.references,
            subject: msg.subject,
            date: msg.date,
            label_id: label_id.clone(),
            is_read,
            is_starred: msg.is_starred,
            is_draft: msg.is_draft,
            has_attachments,
            snippet,
            from_address: msg.from_address,
            from_name: msg.from_name,
            stored,
        });
    }

    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;

    log::debug!(
        "[imap_fetch_and_store] folder={folder} uids={} stored={} account={account_id}",
        uids.len(),
        headers.iter().filter(|h| h.stored).count(),
    );

    Ok(headers)
}

/// Finalize threads after JWZ threading in TypeScript.
/// Writes final thread records, thread_labels, and message thread_id updates via rusqlite.
/// Also cleans up placeholder threads that are no longer the canonical thread ID.
/// Receives pre-computed aggregate values — no SQL aggregate queries needed.
#[tauri::command]
pub async fn imap_store_threads(
    app: tauri::AppHandle,
    account_id: String,
    thread_updates: Vec<ImapThreadUpdate>,
    // all_local_ids: all local_ids created as placeholder threads (to detect orphans)
    all_local_ids: Vec<String>,
) -> Result<u32, String> {
    if thread_updates.is_empty() {
        return Ok(0);
    }

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("velo.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;
    // Phase 2: SQLite Sink Optimization
    conn.execute_batch(
        "PRAGMA cache_size = -2000; \
         PRAGMA journal_mode = WAL; \
         PRAGMA synchronous = NORMAL;"
    ).map_err(|e| e.to_string())?;

    let final_thread_ids: std::collections::HashSet<&str> =
        thread_updates.iter().map(|u| u.thread_id.as_str()).collect();

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let mut stored = 0u32;
    for update in &thread_updates {
        // Upsert final thread record with pre-computed aggregate values
        conn.execute(
            "INSERT INTO threads \
             (id, account_id, subject, snippet, last_message_at, message_count, \
              is_read, is_starred, is_important, has_attachments) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9) \
             ON CONFLICT(account_id, id) DO UPDATE SET \
               subject=?3, snippet=?4, last_message_at=?5, message_count=?6, \
               is_read=?7, is_starred=?8, has_attachments=?9",
            rusqlite::params![
                update.thread_id,
                account_id,
                update.subject,
                update.snippet,
                update.last_message_at,
                update.message_ids.len() as i64,
                update.is_read as i32,
                update.is_starred as i32,
                update.has_attachments as i32,
            ],
        )
        .map_err(|e| e.to_string())?;

        // Replace thread_labels
        conn.execute(
            "DELETE FROM thread_labels WHERE account_id = ?1 AND thread_id = ?2",
            rusqlite::params![account_id, update.thread_id],
        )
        .map_err(|e| e.to_string())?;
        for label_id in &update.label_ids {
            conn.execute(
                "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) \
                 VALUES (?1, ?2, ?3)",
                rusqlite::params![account_id, update.thread_id, label_id],
            )
            .map_err(|e| e.to_string())?;
        }

        // Update thread_id on all member messages
        for msg_id in &update.message_ids {
            conn.execute(
                "UPDATE messages SET thread_id = ?1 WHERE account_id = ?2 AND id = ?3",
                rusqlite::params![update.thread_id, account_id, msg_id],
            )
            .map_err(|e| e.to_string())?;
        }

        stored += 1;
    }

    // Delete orphaned placeholder threads (placeholder_id = message_id, but that message
    // now belongs to a different thread after JWZ merging).
    for local_id in &all_local_ids {
        if !final_thread_ids.contains(local_id.as_str()) {
            conn.execute(
                "DELETE FROM threads \
                 WHERE account_id = ?1 AND id = ?2 \
                 AND NOT EXISTS \
                   (SELECT 1 FROM messages WHERE account_id = ?1 AND thread_id = ?2)",
                rusqlite::params![account_id, local_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;

    log::debug!(
        "[imap_store_threads] stored={stored} threads for account={account_id}"
    );

    Ok(stored)
}

// ---------- Gmail zero-IPC store command ----------

/// Write a complete Gmail thread (messages + attachments + labels) directly to SQLite
/// via rusqlite — no Tauri SQL plugin (WebKit IPC) involved.
/// Bodies are written Rust → SQLite without ever touching the WebKit heap.
/// Returns a tiny acknowledgement; TypeScript handles categorisation separately.
#[tauri::command]
pub async fn gmail_store_thread(
    app: tauri::AppHandle,
    account_id: String,
    thread_id: String,
    subject: Option<String>,
    snippet: Option<String>,
    last_message_at: i64,
    message_count: u32,
    is_read: bool,
    is_starred: bool,
    is_important: bool,
    has_attachments: bool,
    label_ids: Vec<String>,
    messages: Vec<GmailMessage>,
    attachments: Vec<GmailAttachment>,
) -> Result<GmailStoredHeader, String> {
    log::debug!("[gmail_store_thread: thread={thread_id} msgs={}", messages.len());
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("velo.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?;
    // Phase 2: SQLite Sink Optimization
    conn.execute_batch(
        "PRAGMA cache_size = -2000; \
         PRAGMA journal_mode = WAL; \
         PRAGMA synchronous = NORMAL;"
    ).map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    // 1. Upsert thread row
    conn.execute(
        "INSERT INTO threads \
         (id, account_id, subject, snippet, last_message_at, message_count, \
          is_read, is_starred, is_important, has_attachments) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) \
         ON CONFLICT(account_id, id) DO UPDATE SET \
           subject=?3, snippet=?4, last_message_at=?5, message_count=?6, \
           is_read=?7, is_starred=?8, is_important=?9, has_attachments=?10",
        rusqlite::params![
            thread_id,
            account_id,
            subject,
            snippet,
            last_message_at,
            message_count,
            is_read as i32,
            is_starred as i32,
            is_important as i32,
            has_attachments as i32,
        ],
    )
    .map_err(|e| e.to_string())?;

    // 2. Replace thread_labels atomically
    conn.execute(
        "DELETE FROM thread_labels WHERE account_id=?1 AND thread_id=?2",
        rusqlite::params![account_id, thread_id],
    )
    .map_err(|e| e.to_string())?;

    for label_id in &label_ids {
        conn.execute(
            "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) \
             VALUES (?1,?2,?3)",
            rusqlite::params![account_id, thread_id, label_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // 3. Upsert messages (bodies go straight to SQLite — never cross WebKit)
    for msg in &messages {
        let body_cached = if msg.body_html.is_some() { 1i32 } else { 0 };
        conn.execute(
            "INSERT INTO messages \
             (id, account_id, thread_id, from_address, from_name, to_addresses, \
              cc_addresses, bcc_addresses, reply_to, subject, snippet, date, \
              is_read, is_starred, body_html, body_text, body_cached, raw_size, \
              internal_date, list_unsubscribe, list_unsubscribe_post, auth_results, \
              message_id_header, references_header, in_reply_to_header, imap_uid, imap_folder) \
             VALUES \
             (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,NULL,NULL) \
             ON CONFLICT(account_id, id) DO UPDATE SET \
               from_address=?4, from_name=?5, to_addresses=?6, cc_addresses=?7, \
               bcc_addresses=?8, reply_to=?9, subject=?10, snippet=?11, \
               date=?12, is_read=?13, is_starred=?14, \
               body_html=COALESCE(?15, body_html), body_text=COALESCE(?16, body_text), \
               body_cached=CASE WHEN ?15 IS NOT NULL THEN 1 ELSE body_cached END, \
               raw_size=?18, internal_date=?19, list_unsubscribe=?20, \
               list_unsubscribe_post=?21, auth_results=?22, \
               message_id_header=COALESCE(?23, message_id_header), \
               references_header=COALESCE(?24, references_header), \
               in_reply_to_header=COALESCE(?25, in_reply_to_header)",
            rusqlite::params![
                msg.id,
                account_id,
                thread_id,
                msg.from_address,
                msg.from_name,
                msg.to_addresses,
                msg.cc_addresses,
                msg.bcc_addresses,
                msg.reply_to,
                msg.subject,
                msg.snippet,
                msg.date,
                msg.is_read as i32,
                msg.is_starred as i32,
                msg.body_html,
                msg.body_text,
                body_cached,
                msg.raw_size.map(|v| v as i64),
                msg.internal_date,
                msg.list_unsubscribe,
                msg.list_unsubscribe_post,
                msg.auth_results,
                msg.message_id_header,
                msg.references_header,
                msg.in_reply_to_header,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // 4. Upsert attachments
    for att in &attachments {
        conn.execute(
            "INSERT INTO attachments \
             (id, message_id, account_id, filename, mime_type, size, \
              gmail_attachment_id, imap_part_id, content_id, is_inline) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8,?9) \
             ON CONFLICT(id) DO UPDATE SET \
               filename=?4, mime_type=?5, size=?6, \
               gmail_attachment_id=?7, content_id=?8, is_inline=?9",
            rusqlite::params![
                att.id,
                att.message_id,
                account_id,
                att.filename,
                att.mime_type,
                att.size.map(|v| v as i64),
                att.gmail_attachment_id,
                att.content_id,
                att.is_inline as i32,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;

    Ok(GmailStoredHeader {
        thread_id,
        message_count: messages.len() as u32,
    })
}

// ---------- SMTP commands ----------

#[tauri::command]
pub async fn smtp_send_email(
    config: SmtpConfig,
    raw_email: String,
) -> Result<SmtpSendResult, String> {
    smtp_client::send_raw_email(&config, &raw_email).await
}

#[tauri::command]
pub async fn smtp_test_connection(config: SmtpConfig) -> Result<SmtpSendResult, String> {
    smtp_client::test_connection(&config).await
}
