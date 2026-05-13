use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use lettre::{
    transport::smtp::{
        authentication::{Credentials, Mechanism},
        client::{Tls, TlsParametersBuilder},
    },
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::time::timeout;

use super::types::{SmtpConfig, SmtpSendResult};

/// Decode a base64url-encoded string (Gmail format) to raw bytes.
fn decode_base64url(input: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD
        .decode(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}

/// Generate a hash key for an SMTP config to use as a pool key.
fn config_hash(config: &SmtpConfig) -> u64 {
    let mut hasher = DefaultHasher::new();
    config.host.hash(&mut hasher);
    config.port.hash(&mut hasher);
    config.security.hash(&mut hasher);
    config.username.hash(&mut hasher);
    config.auth_method.hash(&mut hasher);
    hasher.finish()
}

/// Global SMTP connection pool keyed by config hash.
/// Reuses existing connections instead of creating a new transport per email.
fn smtp_pool() -> &'static Mutex<HashMap<u64, AsyncSmtpTransport<Tokio1Executor>>> {
    static POOL: OnceLock<Mutex<HashMap<u64, AsyncSmtpTransport<Tokio1Executor>>>> = OnceLock::new();
    POOL.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Port/security mapping:
///   - Port 587 → use STARTTLS (security: "starttls"): `starttls_relay()`
///     Client connects in plain text, then upgrades to TLS via STARTTLS.
///   - Port 465 → use implicit TLS (security: "tls"): `.relay()`
///     Client establishes TLS before any SMTP commands.
///   - Port 25  → use no encryption (security: "none"): `builder_dangerous()`
///     Typically blocked by ISPs; use only for local relays.
///
/// Mailtrap (sandbox) uses port 587 with STARTTLS. If the UI selects "SSL/TLS"
/// (= "tls") on port 587, it will fail because port 587 requires STARTTLS.
/// The frontend should map UI "SSL/TLS" + port 587 → "starttls".
fn build_standalone_transport(
    config: &SmtpConfig,
) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let credentials = Credentials::new(config.username.clone(), config.password.clone());

    let auth_mechanisms = if config.auth_method == "oauth2" {
        vec![Mechanism::Xoauth2]
    } else {
        vec![Mechanism::Plain, Mechanism::Login]
    };

    let transport = match config.security.as_str() {
        "tls" => {
            let mut builder = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
                .map_err(|e| format!("SMTP relay error: {}", e))?
                .port(config.port)
                .credentials(credentials)
                .authentication(auth_mechanisms);

            if config.accept_invalid_certs {
                let tls_params = TlsParametersBuilder::new(config.host.clone())
                    .dangerous_accept_invalid_certs(true)
                    .dangerous_accept_invalid_hostnames(true)
                    .build()
                    .map_err(|e| format!("SMTP TLS params error: {}", e))?;
                builder = builder.tls(Tls::Required(tls_params));
            }

            builder.build()
        }
        "starttls" => {
            let mut builder = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
                .map_err(|e| format!("SMTP STARTTLS error: {}", e))?
                .port(config.port)
                .credentials(credentials)
                .authentication(auth_mechanisms);

            if config.accept_invalid_certs {
                let tls_params = TlsParametersBuilder::new(config.host.clone())
                    .dangerous_accept_invalid_certs(true)
                    .dangerous_accept_invalid_hostnames(true)
                    .build()
                    .map_err(|e| format!("SMTP TLS params error: {}", e))?;
                builder = builder.tls(Tls::Required(tls_params));
            }

            builder.build()
        }
        _ => {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
                .port(config.port)
                .credentials(credentials)
                .authentication(auth_mechanisms)
                .build()
        }
    };

    Ok(transport)
}

/// Build or retrieve a cached SMTP transport from the global pool.
fn get_or_create_transport(
    config: &SmtpConfig,
) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
    let hash = config_hash(config);

    // Check pool for existing transport
    if let Ok(pool) = smtp_pool().lock() {
        if let Some(transport) = pool.get(&hash) {
            return Ok(transport.clone());
        }
    }

    // Create new transport
    let transport = build_standalone_transport(config)?;

    // Store in pool (ignore lock errors — best effort caching)
    if let Ok(mut pool) = smtp_pool().lock() {
        pool.insert(hash, transport.clone());
    }

    Ok(transport)
}

/// Extract an SMTP envelope (sender + recipients) from raw RFC 2822 bytes.
///
/// The envelope tells the SMTP server who the mail is from and who to deliver
/// it to, which is separate from the header fields visible to the recipient.
fn extract_envelope(raw: &[u8]) -> Result<lettre::address::Envelope, String> {
    let message = mail_parser::MessageParser::default()
        .parse(raw)
        .ok_or("Failed to parse email for envelope extraction")?;

    // Extract From address
    let from = message
        .from()
        .and_then(|list| list.first())
        .and_then(|addr| addr.address())
        .ok_or("No From address found in email")?;

    let from_addr: lettre::Address = from
        .parse()
        .map_err(|e| format!("Invalid From address '{}': {}", from, e))?;

    // Collect all recipient addresses (To, Cc, Bcc)
    let mut recipients: Vec<lettre::Address> = Vec::new();

    if let Some(to_list) = message.to() {
        for addr in to_list.iter() {
            if let Some(email) = addr.address() {
                if let Ok(a) = email.parse::<lettre::Address>() {
                    recipients.push(a);
                }
            }
        }
    }

    if let Some(cc_list) = message.cc() {
        for addr in cc_list.iter() {
            if let Some(email) = addr.address() {
                if let Ok(a) = email.parse::<lettre::Address>() {
                    recipients.push(a);
                }
            }
        }
    }

    if let Some(bcc_list) = message.bcc() {
        for addr in bcc_list.iter() {
            if let Some(email) = addr.address() {
                if let Ok(a) = email.parse::<lettre::Address>() {
                    recipients.push(a);
                }
            }
        }
    }

    if recipients.is_empty() {
        return Err("No recipients found in email".to_string());
    }

    lettre::address::Envelope::new(Some(from_addr), recipients)
        .map_err(|e| format!("Envelope error: {}", e))
}

/// Send a pre-built RFC 2822 email via SMTP.
///
/// The `raw_email_base64url` parameter is the full email message encoded as
/// base64url (the same encoding Gmail uses: `+` → `-`, `/` → `_`, no padding).
/// The function decodes it, extracts the envelope from headers, and sends it.
/// Uses the global connection pool to reuse SMTP connections.
pub async fn send_raw_email(
    config: &SmtpConfig,
    raw_email_base64url: &str,
) -> Result<SmtpSendResult, String> {
    let raw_bytes = decode_base64url(raw_email_base64url)?;
    let envelope = extract_envelope(&raw_bytes)?;
    let hash = config_hash(config);
    let transport = get_or_create_transport(config)?;

    let result = transport
        .send_raw(&envelope, &raw_bytes)
        .await
        .map(|_response| SmtpSendResult {
            success: true,
            message: "Email sent successfully".to_string(),
        })
        .map_err(|e| format!("SMTP send error: {}", e));

    // On connection error, remove from pool so next call creates a fresh transport
    if let Err(ref e) = result {
        if e.contains("connection") || e.contains("timeout") || e.contains("closed") {
            if let Ok(mut pool) = smtp_pool().lock() {
                pool.remove(&hash);
            }
        }
    }

    result
}

/// Test SMTP connectivity by connecting, authenticating, and disconnecting.
///
/// Wraps the operation with a 30-second timeout to prevent hanging on
/// unreachable hosts, firewall blocks, or TLS negotiation failures
/// (e.g. Windows SSPI/Schannel errors on port 587).
pub async fn test_connection(config: &SmtpConfig) -> Result<SmtpSendResult, String> {
    let transport = build_standalone_transport(config)?;

    let result = timeout(Duration::from_secs(30), transport.test_connection())
        .await
        .map_err(|_| {
            format!(
                "SMTP connection to {}:{} timed out after 30s — check your server settings, firewall, or try STARTTLS on port 587",
                config.host, config.port
            )
        })?;

    result
        .map(|success| SmtpSendResult {
            success,
            message: if success {
                "Connection successful".to_string()
            } else {
                "Connection failed".to_string()
            },
        })
        .map_err(|e| format!("SMTP test error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_base64url_valid() {
        // "Hello" in base64url
        let encoded = "SGVsbG8";
        let decoded = decode_base64url(encoded).unwrap();
        assert_eq!(decoded, b"Hello");
    }

    #[test]
    fn test_decode_base64url_invalid() {
        let result = decode_base64url("!!!invalid!!!");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Base64 decode error"));
    }

    #[test]
    fn test_extract_envelope_valid() {
        let raw = b"From: alice@example.com\r\nTo: bob@example.com\r\nCc: carol@example.com\r\nSubject: Test\r\n\r\nBody";
        let envelope = extract_envelope(raw).unwrap();
        // Envelope should have from and 2 recipients (To + Cc)
        assert!(envelope.from().is_some());
        assert_eq!(envelope.to().len(), 2);
    }

    #[test]
    fn test_extract_envelope_no_from() {
        let raw = b"To: bob@example.com\r\nSubject: Test\r\n\r\nBody";
        let result = extract_envelope(raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No From address"));
    }

    #[test]
    fn test_extract_envelope_no_recipients() {
        let raw = b"From: alice@example.com\r\nSubject: Test\r\n\r\nBody";
        let result = extract_envelope(raw);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No recipients found"));
    }

    #[test]
    fn test_extract_envelope_with_bcc() {
        let raw = b"From: alice@example.com\r\nTo: bob@example.com\r\nBcc: secret@example.com\r\nSubject: Test\r\n\r\nBody";
        let envelope = extract_envelope(raw).unwrap();
        assert_eq!(envelope.to().len(), 2);
    }
}
