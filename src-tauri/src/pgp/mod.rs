pub mod cache;
pub mod crypto;
pub mod keyring;

#[tauri::command]
pub fn decrypt_message(
    ciphertext_b64: String,
    private_key_armored: String,
    passphrase: String,
) -> Result<String, String> {
    crypto::decrypt_message(&ciphertext_b64, &private_key_armored, &passphrase)
}

#[tauri::command]
pub fn cache_passphrase(account_id: String, passphrase: String) -> Result<(), String> {
    cache::store(&account_id, &passphrase);
    Ok(())
}

#[tauri::command]
pub fn get_cached_passphrase(account_id: String) -> Result<Option<String>, String> {
    Ok(cache::get(&account_id))
}

#[tauri::command]
pub fn clear_passphrase_cache(account_id: String) -> Result<(), String> {
    cache::clear(&account_id);
    Ok(())
}
