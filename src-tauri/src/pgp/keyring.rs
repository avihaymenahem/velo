use sequoia_openpgp as openpgp;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PgpKeyInfo {
    pub key_id: String,
    pub fingerprint: String,
    pub creation_time: String,
}

pub fn generate_key_pair(user_id: &str, passphrase: &str) -> Result<(String, String), String> {
    use openpgp::cert::CipherSuite;
    use openpgp::policy::StandardPolicy;
    use openpgp::serialize::SerializeInto;

    let (cert, _) = openpgp::cert::CertBuilder::new()
        .set_cipher_suite(CipherSuite::Cv25519)
        .add_userid(user_id)
        .generate()
        .map_err(|e| format!("Key generation failed: {}", e))?;

    let policy = StandardPolicy::new();

    // Export public key (armored)
    let public_key = cert
        .armored()
        .serialize_to_vec()
        .map_err(|e| format!("Serialize public key failed: {}", e))?;
    let public_armored = String::from_utf8_lossy(&public_key).to_string();

    // Export encrypted private key
    let private_key = cert
        .as_tsk()
        .armored()
        .serialize_to_vec()
        .map_err(|e| format!("Serialize private key failed: {}", e))?;
    let private_armored = String::from_utf8_lossy(&private_key).to_string();

    Ok((public_armored, private_armored))
}

pub fn get_key_info(armored_key: &str) -> Result<PgpKeyInfo, String> {
    use openpgp::parse::Parse;

    let cert =
        openpgp::Cert::from_str(armored_key).map_err(|e| format!("Parse key failed: {}", e))?;

    let fingerprint = cert.fingerprint().to_string();
    let key_id = cert.keyid().to_string();

    let creation_time = "0";

    Ok(PgpKeyInfo {
        key_id,
        fingerprint,
        creation_time: creation_time.to_string(),
    })
}

#[tauri::command]
pub fn generate_key(user_id: String, passphrase: String) -> Result<(String, String), String> {
    generate_key_pair(&user_id, &passphrase)
}

#[tauri::command]
pub fn get_key_info_cmd(armored_key: String) -> Result<PgpKeyInfo, String> {
    get_key_info(&armored_key)
}
