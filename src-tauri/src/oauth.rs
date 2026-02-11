use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Serialize)]
pub struct OAuthResult {
    pub code: String,
    pub state: String,
}

/// Binds to a localhost port for OAuth callback. Tries the given port first,
/// falls back to nearby ports if taken.
#[tauri::command]
pub async fn start_oauth_server(port: u16, state: String) -> Result<OAuthResult, String> {
    // Try the requested port, then a few alternatives
    let mut listener = None;
    for p in [port, port + 1, port + 2, port + 3] {
        match TcpListener::bind(format!("127.0.0.1:{}", p)).await {
            Ok(l) => {
                listener = Some(l);
                break;
            }
            Err(_) => continue,
        }
    }

    let listener = listener.ok_or("Failed to bind to any port")?;
    let actual_port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get addr: {}", e))?
        .port();

    log::info!("OAuth callback server listening on port {}", actual_port);

    // Wait for exactly one connection (the redirect from Google) with 5-minute timeout
    let (mut stream, _) = tokio::time::timeout(
        Duration::from_secs(300),
        listener.accept(),
    )
    .await
    .map_err(|_| "OAuth timed out — please try again".to_string())?
    .map_err(|e| format!("Failed to accept: {}", e))?;

    // Read the HTTP request
    let mut buf = vec![0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read: {}", e))?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Extract query string from GET request line
    let (code, returned_state) = parse_auth_code_and_state(&request)?;

    // Validate state parameter (CSRF protection)
    if returned_state != state {
        return Err("OAuth state mismatch — possible CSRF attack".to_string());
    }

    // Send a success response to the browser
    let html = r#"<!DOCTYPE html>
<html>
<head><title>Velo</title></head>
<body style="font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0;">
<div style="text-align: center;">
<h1 style="margin-bottom: 8px;">Account Connected!</h1>
<p style="opacity: 0.7;">You can close this tab and return to Velo.</p>
</div>
</body>
</html>"#;

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );

    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;

    drop(listener);

    Ok(OAuthResult { code, state: returned_state })
}

fn parse_auth_code_and_state(request: &str) -> Result<(String, String), String> {
    let first_line = request.lines().next().ok_or("Empty request")?;

    let path = first_line
        .split_whitespace()
        .nth(1)
        .ok_or("No path in request")?;

    if path.contains("error=") {
        let params = parse_query_string(path);
        let error = params.get("error").cloned().unwrap_or_default();
        return Err(format!("OAuth error: {}", error));
    }

    let params = parse_query_string(path);
    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| "No auth code in redirect".to_string())?;
    let state = params
        .get("state")
        .cloned()
        .ok_or_else(|| "No state in redirect".to_string())?;
    Ok((code, state))
}

fn parse_query_string(path: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    if let Some(query) = path.split('?').nth(1) {
        for pair in query.split('&') {
            let mut kv = pair.splitn(2, '=');
            if let (Some(key), Some(value)) = (kv.next(), kv.next()) {
                params.insert(key.to_string(), urlencoding_decode(value));
            }
        }
    }
    params
}

fn urlencoding_decode(s: &str) -> String {
    let mut result = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                &s[i + 1..i + 3],
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            result.push(b' ');
        } else {
            result.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8(result).unwrap_or_else(|_| s.to_string())
}
