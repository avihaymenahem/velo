use tauri::{AppHandle, Emitter};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub fn run_backup_scheduler(app: AppHandle) -> Arc<AtomicBool> {
    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();

    tokio::spawn(async move {
        loop {
            if !r.load(Ordering::Relaxed) {
                break;
            }

            let _ = app.emit("backup-tick", ());

            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        }
    });

    running
}

pub fn stop_backup_scheduler(running: &Arc<AtomicBool>) {
    running.store(false, Ordering::Relaxed);
}
