use crate::imap::client as imap_client;
use crate::imap::types::{ImapConfig, ImapFetchResult, ImapFolder, ImapFolderStatus, ImapMessage};
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
    config: ImapConfig,
    folder: String,
    uids: Vec<u32>,
) -> Result<ImapFetchResult, String> {
    if uids.is_empty() {
        return Err("No UIDs provided".to_string());
    }

    let mut session = imap_client::connect(&config).await?;

    // Build a UID set string like "1,5,10,20"
    let uid_set: String = uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let result = imap_client::fetch_messages(&mut session, &folder, &uid_set).await?;
    let _ = session.logout().await;
    Ok(result)
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
pub async fn imap_fetch_message_body(
    config: ImapConfig,
    folder: String,
    uid: u32,
) -> Result<ImapMessage, String> {
    let mut session = imap_client::connect(&config).await?;
    let message = imap_client::fetch_message_body(&mut session, &folder, uid).await?;
    let _ = session.logout().await;
    Ok(message)
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
    config: ImapConfig,
    folder: String,
    uid: u32,
    part_id: String,
) -> Result<String, String> {
    let mut session = imap_client::connect(&config).await?;
    let data = imap_client::fetch_attachment(&mut session, &folder, uid, &part_id).await?;
    let _ = session.logout().await;
    Ok(data)
}

#[tauri::command]
pub async fn imap_append_message(
    config: ImapConfig,
    folder: String,
    flags: Option<String>,
    raw_message: String,
) -> Result<(), String> {
    let mut session = imap_client::connect(&config).await?;

    // raw_message is base64url-encoded; decode it
    let raw_bytes = base64url_decode(&raw_message)?;

    let flags_ref = flags.as_deref();
    imap_client::append_message(&mut session, &folder, flags_ref, &raw_bytes).await?;
    let _ = session.logout().await;
    Ok(())
}

fn base64url_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    engine
        .decode(input)
        .map_err(|e| format!("base64url decode failed: {e}"))
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
