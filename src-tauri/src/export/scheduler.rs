use tauri::{AppHandle, Emitter};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[allow(dead_code)]
pub fn run_backup_scheduler(app: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    let handle = app.clone();
    tokio::spawn(async move {
        // Check every 60 seconds for backup schedules whose next_run_at is due
        loop {
            if !r.load(Ordering::Relaxed) {
                break;
            }

            // Emit event for the frontend to check schedules
            let _ = handle.emit("backup-tick", ());

            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        }
    });
}

#[allow(dead_code)]
pub fn stop_backup_scheduler(running: &Arc<AtomicBool>) {
    running.store(false, Ordering::Relaxed);
}
