use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Mbox,
    Eml,
    Pdf,
    Zip,
}

impl std::fmt::Display for ExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportFormat::Mbox => write!(f, "mbox"),
            ExportFormat::Eml => write!(f, "eml"),
            ExportFormat::Pdf => write!(f, "pdf"),
            ExportFormat::Zip => write!(f, "zip"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    pub account_id: String,
    pub format: ExportFormat,
    pub destination_path: String,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub include_attachments: bool,
    pub encrypt_backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupSchedule {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub format: ExportFormat,
    pub destination_path: String,
    pub cron_expression: String,
    pub is_enabled: i64,
    pub include_attachments: i64,
    pub encrypt: i64,
    pub last_run_at: Option<i64>,
    pub next_run_at: Option<i64>,
    pub created_at: Option<i64>,
}

#[tauri::command]
pub fn get_export_formats() -> Vec<String> {
    vec!["mbox".into(), "eml".into(), "pdf".into(), "zip".into()]
}

#[tauri::command]
pub fn validate_export_config(format: String, destination: String) -> Result<bool, String> {
    if destination.is_empty() {
        return Err("Destination path cannot be empty".to_string());
    }
    if !["mbox", "eml", "pdf", "zip"].contains(&format.as_str()) {
        return Err(format!("Unknown export format: {}", format));
    }
    Ok(true)
}
