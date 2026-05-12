use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub format: ExportFormat,
    pub enabled: bool,
    pub interval_minutes: i64,
    pub destination_path: String,
    pub include_attachments: bool,
    pub encrypt_backup: bool,
    pub last_run_at: Option<i64>,
    pub next_run_at: Option<i64>,
}
