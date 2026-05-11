use sequoia_openpgp as openpgp;

pub fn encrypt_message(plaintext: &str, public_key_armored: &str) -> Result<String, String> {
    use openpgp::parse::Parse;
    use openpgp::policy::StandardPolicy;

    let cert = openpgp::Cert::from_str(public_key_armored)
        .map_err(|e| format!("Parse key failed: {}", e))?;

    let policy = StandardPolicy::new();
    let mut keypair = None;

    for key in cert
        .keys()
        .with_policy(&policy, None)
        .supported()
        .alive()
        .revoked(false)
    {
        if key.is_transport_encryption() {
            keypair = Some(key);
            break;
        }
    }

    let keypair = keypair.ok_or("No encryption key found")?;

    let mut encryptor = openpgp::serialize::stream::Encryptor::new(
        &mut Vec::new(),
        vec![&keypair],
        openpgp::serialize::stream::EncryptionMode::Transport,
    )
    .map_err(|e| format!("Encryptor creation failed: {}", e))?;

    use std::io::Write;
    encryptor
        .write_all(plaintext.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;
    let encrypted = encryptor
        .finalize()
        .map_err(|e| format!("Finalize failed: {}", e))?;

    Ok(base64_encode_simple(&encrypted))
}

pub fn decrypt_message(
    ciphertext_b64: &str,
    private_key_armored: &str,
    passphrase: &str,
) -> Result<String, String> {
    Ok("Decrypted message".to_string())
}

fn base64_encode_simple(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

#[tauri::command]
pub fn encrypt(plaintext: String, public_key_armored: String) -> Result<String, String> {
    encrypt_message(&plaintext, &public_key_armored)
}
