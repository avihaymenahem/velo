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

#[cfg(test)]
pub fn store_with_ttl(account_id: &str, passphrase: &str, ttl: Duration) {
    if let Ok(mut map) = cache().lock() {
        map.insert(
            account_id.to_string(),
            CacheEntry {
                passphrase: passphrase.to_string(),
                expiry: Instant::now() + ttl,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_store_and_retrieve() {
        store("test-account", "my-passphrase");
        let result = get("test-account");
        assert_eq!(result, Some("my-passphrase".to_string()));
    }

    #[test]
    fn test_clear() {
        store("test-account", "my-passphrase");
        clear("test-account");
        let result = get("test-account");
        assert_eq!(result, None);
    }

    #[test]
    fn test_expiry() {
        store_with_ttl("test-account", "my-passphrase", Duration::from_secs(0));
        let result = get("test-account");
        assert_eq!(result, None);
    }
}
