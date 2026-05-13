use tauri::{AppHandle, Emitter};

pub async fn run_backup_scheduler(app: AppHandle) {
    loop {
        let _ = app.emit("backup-tick", ());
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}
