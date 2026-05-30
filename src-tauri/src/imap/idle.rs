//! IMAP IDLE (RFC 2177) — long-lived push-notification connections.
//!
//! Each `(account_id, folder)` runs in its own dedicated session, never reused
//! from the pool. The session opens, SELECTs the folder, issues IDLE, and waits
//! up to 29 min (RFC 2177 recommendation) for any unilateral response. On any
//! event — new data, timeout, or transport error — we emit a Tauri event
//! `imap-idle-event` and reconnect on the next loop iteration. Cancellation
//! comes from a `watch` channel signalled by `stop`/`stop_all_for_account`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use async_imap::extensions::idle::IdleResponse;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::{watch, Mutex};

use super::client as imap_client;
use super::types::ImapConfig;

const IDLE_TIMEOUT: Duration = Duration::from_secs(29 * 60);
const RECONNECT_BACKOFFS: &[Duration] = &[
    Duration::from_secs(5),
    Duration::from_secs(30),
    Duration::from_secs(120),
    Duration::from_secs(300),
];

#[derive(Clone, Serialize)]
pub struct IdleEvent {
    pub account_id: String,
    pub folder: String,
    /// One of: "started" | "new" | "timeout" | "error" | "unsupported" | "stopped"
    pub kind: String,
}

struct IdleEntry {
    cancel: watch::Sender<bool>,
}

#[derive(Default)]
pub struct ImapIdleRegistry {
    entries: Mutex<HashMap<String, IdleEntry>>,
}

fn key(account_id: &str, folder: &str) -> String {
    format!("{account_id}::{folder}")
}

impl ImapIdleRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn start(
        self: Arc<Self>,
        app: AppHandle,
        account_id: String,
        folder: String,
        config: ImapConfig,
    ) -> Result<(), String> {
        let k = key(&account_id, &folder);
        {
            let entries = self.entries.lock().await;
            if entries.contains_key(&k) {
                log::debug!("[IDLE] already running for {k}");
                return Ok(());
            }
        }
        let (cancel_tx, cancel_rx) = watch::channel(false);
        {
            let mut entries = self.entries.lock().await;
            entries.insert(k.clone(), IdleEntry { cancel: cancel_tx });
        }

        let registry = self.clone();
        let k_for_task = k.clone();
        tokio::spawn(async move {
            idle_loop(app, account_id, folder, config, cancel_rx).await;
            let mut entries = registry.entries.lock().await;
            entries.remove(&k_for_task);
        });

        log::info!("[IDLE] started {k}");
        Ok(())
    }

    pub async fn stop(&self, account_id: &str, folder: &str) {
        let k = key(account_id, folder);
        let mut entries = self.entries.lock().await;
        if let Some(entry) = entries.remove(&k) {
            let _ = entry.cancel.send(true);
            log::info!("[IDLE] stop requested for {k}");
        }
    }

    pub async fn stop_all_for_account(&self, account_id: &str) {
        let prefix = format!("{account_id}::");
        let mut entries = self.entries.lock().await;
        let keys: Vec<String> = entries
            .keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();
        for k in keys {
            if let Some(entry) = entries.remove(&k) {
                let _ = entry.cancel.send(true);
            }
        }
    }

    pub async fn stop_all(&self) {
        let mut entries = self.entries.lock().await;
        for (_, entry) in entries.drain() {
            let _ = entry.cancel.send(true);
        }
    }

    pub async fn list_active(&self) -> Vec<String> {
        let entries = self.entries.lock().await;
        entries.keys().cloned().collect()
    }
}

fn emit_event(app: &AppHandle, account_id: &str, folder: &str, kind: &str) {
    let _ = app.emit(
        "imap-idle-event",
        IdleEvent {
            account_id: account_id.to_string(),
            folder: folder.to_string(),
            kind: kind.to_string(),
        },
    );
}

async fn wait_or_cancel(cancel_rx: &mut watch::Receiver<bool>, dur: Duration) -> bool {
    tokio::select! {
        _ = tokio::time::sleep(dur) => true,
        _ = cancel_rx.changed() => false,
    }
}

async fn idle_loop(
    app: AppHandle,
    account_id: String,
    folder: String,
    config: ImapConfig,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let mut backoff_idx: usize = 0;
    emit_event(&app, &account_id, &folder, "started");

    loop {
        if *cancel_rx.borrow() {
            break;
        }

        // 1. Connect (dedicated session, never from the pool)
        let mut session = match imap_client::connect(&config).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[IDLE] connect failed {account_id}/{folder}: {e}");
                emit_event(&app, &account_id, &folder, "error");
                let dur = RECONNECT_BACKOFFS[backoff_idx];
                if !wait_or_cancel(&mut cancel_rx, dur).await {
                    break;
                }
                backoff_idx = (backoff_idx + 1).min(RECONNECT_BACKOFFS.len() - 1);
                continue;
            }
        };

        // 2. CAPABILITY check — bail out completely if server lacks IDLE
        let supports_idle = match session.capabilities().await {
            Ok(caps) => caps.has_str("IDLE"),
            Err(e) => {
                log::warn!("[IDLE] CAPABILITY failed {account_id}/{folder}: {e}");
                false
            }
        };
        if !supports_idle {
            log::info!("[IDLE] server does not support IDLE for {account_id}/{folder} — exiting watcher");
            emit_event(&app, &account_id, &folder, "unsupported");
            let _ = session.logout().await;
            break;
        }

        // 3. SELECT folder
        if let Err(e) = session.select(&folder).await {
            log::warn!("[IDLE] SELECT {folder} failed: {e}");
            emit_event(&app, &account_id, &folder, "error");
            let _ = session.logout().await;
            let dur = RECONNECT_BACKOFFS[backoff_idx];
            if !wait_or_cancel(&mut cancel_rx, dur).await {
                break;
            }
            backoff_idx = (backoff_idx + 1).min(RECONNECT_BACKOFFS.len() - 1);
            continue;
        }

        backoff_idx = 0;

        // 4. Enter IDLE
        let mut handle = session.idle();
        if let Err(e) = handle.init().await {
            log::warn!("[IDLE] init failed {account_id}/{folder}: {e}");
            emit_event(&app, &account_id, &folder, "error");
            // handle can't gracefully recover the session — let it drop
            if !wait_or_cancel(&mut cancel_rx, Duration::from_secs(5)).await {
                break;
            }
            continue;
        }

        let cancelled = {
            let (wait_fut, stop_source) = handle.wait_with_timeout(IDLE_TIMEOUT);
            tokio::pin!(wait_fut);

            tokio::select! {
                res = &mut wait_fut => {
                    match res {
                        Ok(IdleResponse::NewData(_)) => {
                            emit_event(&app, &account_id, &folder, "new");
                        }
                        Ok(IdleResponse::Timeout) => {
                            log::debug!("[IDLE] 29-min keep-alive re-issue {account_id}/{folder}");
                        }
                        Ok(IdleResponse::ManualInterrupt) => {}
                        Err(e) => {
                            log::warn!("[IDLE] wait error {account_id}/{folder}: {e}");
                            emit_event(&app, &account_id, &folder, "error");
                        }
                    }
                    false
                }
                _ = cancel_rx.changed() => {
                    drop(stop_source);
                    // Let wait_fut resolve so the borrow ends
                    let _ = (&mut wait_fut).await;
                    true
                }
            }
        };

        // Gracefully end IDLE then close the session
        if let Ok(mut session_back) = handle.done().await {
            let _ = session_back.logout().await;
        }

        if cancelled {
            break;
        }
    }

    emit_event(&app, &account_id, &folder, "stopped");
    log::info!("[IDLE] loop exited for {account_id}/{folder}");
}
