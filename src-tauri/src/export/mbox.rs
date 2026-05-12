use std::io::Write;
use std::path::Path;

#[tauri::command]
pub fn append_to_mbox(
    file_path: String,
    message_rfc2822: String,
    from_address: String,
    date_seconds: i64,
) -> Result<(), String> {
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;

    let date_str = chrono::DateTime::from_timestamp(date_seconds, 0)
        .map(|dt| dt.format("%a %b %d %H:%M:%S %Y").to_string())
        .unwrap_or_default();
    writeln!(file, "From {from_address} {date_str}").map_err(|e| e.to_string())?;

    for line in message_rfc2822.lines() {
        if line.starts_with("From ") {
            writeln!(file, ">{line}").map_err(|e| e.to_string())?;
        } else {
            writeln!(file, "{line}").map_err(|e| e.to_string())?;
        }
    }

    writeln!(file).map_err(|e| e.to_string())?;
    Ok(())
}
