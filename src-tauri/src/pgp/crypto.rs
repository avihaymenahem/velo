use sequoia_openpgp as openpgp;

pub fn encrypt_message(plaintext: &str, public_key_armored: &str) -> Result<String, String> {
    use openpgp::parse::Parse;
    use openpgp::policy::StandardPolicy;
    use openpgp::serialize::stream::{Armorer, Encryptor, LiteralWriter, Message};
    use std::io::Write;

    let cert = openpgp::Cert::from_bytes(public_key_armored.as_bytes())
        .map_err(|e| format!("Parse key failed: {}", e))?;

    let policy = StandardPolicy::new();
    let recipients = cert
        .keys()
        .with_policy(&policy, None)
        .supported()
        .alive()
        .revoked(false)
        .for_transport_encryption();

    let mut encrypted = Vec::new();
    let message = Message::new(&mut encrypted);
    let message = Armorer::new(message)
        .build()
        .map_err(|e| format!("Armorer creation failed: {}", e))?;
    let message = Encryptor::for_recipients(message, recipients)
        .build()
        .map_err(|e| format!("Encryptor creation failed: {}", e))?;
    let mut message = LiteralWriter::new(message)
        .build()
        .map_err(|e| format!("Literal writer creation failed: {}", e))?;

    message
        .write_all(plaintext.as_bytes())
        .map_err(|e| format!("Write failed: {}", e))?;
    message
        .finalize()
        .map_err(|e| format!("Finalize failed: {}", e))?;

    Ok(base64_encode_simple(&encrypted))
}

pub fn decrypt_message(
    _ciphertext_b64: &str,
    _private_key_armored: &str,
    _passphrase: &str,
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
