use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const CACHE_TIMEOUT: Duration = Duration::from_secs(15 * 60);

struct CacheEntry {
    passphrase: String,
    expiry: Instant,
}

fn cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn store(account_id: &str, passphrase: &str) {
    if let Ok(mut map) = cache().lock() {
        map.insert(
            account_id.to_string(),
            CacheEntry {
                passphrase: passphrase.to_string(),
                expiry: Instant::now() + CACHE_TIMEOUT,
            },
        );
    }
}

pub fn get(account_id: &str) -> Option<String> {
    let map = cache().lock().ok()?;
    if let Some(entry) = map.get(account_id) {
        if Instant::now() < entry.expiry {
            return Some(entry.passphrase.clone());
        }
    }
    None
}

pub fn clear(account_id: &str) {
    if let Ok(mut map) = cache().lock() {
        map.remove(account_id);
    }
}
