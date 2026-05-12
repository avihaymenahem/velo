use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn get_vault_root(app: tauri::AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vault");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid vault path".to_string())
}

#[tauri::command]
pub fn copy_to_vault(source_path: String, vault_path: String) -> Result<(), String> {
    let dest = PathBuf::from(&vault_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_from_vault(vault_path: String) -> Result<(), String> {
    std::fs::remove_file(&vault_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_vault_dir(dir_path: String) -> Result<Vec<String>, String> {
    let entries = std::fs::read_dir(&dir_path).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    for entry in entries {
        if let Ok(e) = entry {
            files.push(e.path().to_string_lossy().to_string());
        }
    }
    Ok(files)
}
