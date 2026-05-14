use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::Mutex;

use async_imap::Session;

use super::client::{self as imap_client, ImapStream};
use super::types::ImapConfig;

type ImapSession = Session<ImapStream>;

const MAX_SESSIONS_PER_KEY: usize = 2;
const NOOP_TIMEOUT: Duration = Duration::from_secs(5);

/// Global IMAP session pool. Stored as Tauri managed state so every command shares
/// the same pool. Keyed by "host:port:security:user" — sessions are returned after
/// successful use and reused by the next request, avoiding a full TCP/TLS handshake
/// and LOGIN for every attachment/CID fetch.
pub struct ImapSessionPool {
    sessions: Mutex<HashMap<String, Vec<ImapSession>>>,
}

fn session_key(config: &ImapConfig) -> String {
    format!("{}:{}:{}:{}", config.host, config.port, config.security, config.username)
}

impl ImapSessionPool {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Acquire a session from the pool, or create a new one.
    ///
    /// Returns `(session, pool_key)`. The caller is responsible for calling
    /// [`release`] on success or letting the session drop on error (which closes
    /// the TCP connection automatically).
    pub async fn acquire(&self, config: &ImapConfig) -> Result<(ImapSession, String), String> {
        let key = session_key(config);

        // Pop a candidate session while holding the lock, then immediately drop
        // the lock so the NOOP probe doesn't block other threads.
        let maybe_session = {
            let mut guard = self.sessions.lock().await;
            guard.get_mut(&key).and_then(|v| v.pop())
        };

        if let Some(mut session) = maybe_session {
            let noop_ok = tokio::time::timeout(NOOP_TIMEOUT, session.noop())
                .await
                .is_ok_and(|r| r.is_ok());

            if noop_ok {
                log::debug!("[ImapPool] reusing session key={key}");
                return Ok((session, key));
            }
            log::warn!("[ImapPool] pooled session dead (NOOP failed), key={key} — reconnecting");
            // session dropped here, connection closed
        }

        log::debug!("[ImapPool] new session key={key}");
        let session = imap_client::connect(config).await?;
        Ok((session, key))
    }

    /// Return a session to the pool after a successful operation.
    pub async fn release(&self, key: String, session: ImapSession) {
        let mut guard = self.sessions.lock().await;
        let pool = guard.entry(key).or_default();
        if pool.len() < MAX_SESSIONS_PER_KEY {
            pool.push(session);
        }
        // If pool is full the session is dropped (graceful close).
    }
}
