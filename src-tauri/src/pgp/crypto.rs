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
    ciphertext_b64: &str,
    private_key_armored: &str,
    passphrase: &str,
) -> Result<String, String> {
    use openpgp::parse::stream::{
        DecryptionHelper, DecryptorBuilder, MessageLayer, MessageStructure, VerificationHelper,
    };
    use openpgp::parse::Parse;
    use openpgp::policy::StandardPolicy;
    use openpgp::types::SymmetricAlgorithm;
    use std::io::Read;

    let p = StandardPolicy::new();

    let cert = openpgp::Cert::from_bytes(private_key_armored.as_bytes())
        .map_err(|e| format!("Failed to parse private key: {}", e))?;

    let mut keypairs: Vec<openpgp::crypto::KeyPair> = Vec::new();
    for ka in cert
        .keys()
        .secret()
        .with_policy(&p, None)
        .supported()
        .alive()
        .revoked(false)
        .for_transport_encryption()
    {
        let mut key = ka.key().clone();
        key.decrypt_secret(passphrase)
            .map_err(|e| format!("Failed to decrypt secret key: {}", e))?;
        let keypair = key
            .into_keypair()
            .map_err(|e| format!("Failed to create keypair: {}", e))?;
        keypairs.push(keypair);
    }

    if keypairs.is_empty() {
        let mut key = cert.primary_key().key().clone();
        if key.decrypt_secret(passphrase).is_ok() {
            if let Ok(keypair) = key.into_keypair() {
                keypairs.push(keypair);
            }
        }
    }

    if keypairs.is_empty() {
        return Err(
            "No suitable decryption key found. Check passphrase or private key.".to_string(),
        );
    }

    use base64::Engine;
    let ciphertext_bytes = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| format!("Failed to decode base64 ciphertext: {}", e))?;

    struct Helper {
        keypairs: Vec<openpgp::crypto::KeyPair>,
    }

    impl DecryptionHelper for Helper {
        fn decrypt<D>(
            &mut self,
            _pkesks: &[openpgp::packet::PKESK],
            _skesks: &[openpgp::packet::SKESK],
            _sym_algo: Option<SymmetricAlgorithm>,
            _mut_decrypt: D,
        ) -> openpgp::Result<Option<openpgp::Fingerprint>>
        where
            D: FnMut(SymmetricAlgorithm, &openpgp::crypto::SessionKey) -> bool,
        {
            Ok(None)
        }
    }

    impl VerificationHelper for Helper {
        fn verify(&mut self, _structure: MessageStructure) -> openpgp::Result<()> {
            Ok(())
        }
    }

    let helper = Helper { keypairs };

    let mut plaintext = Vec::new();
    let mut decryptor = DecryptorBuilder::from_bytes(&ciphertext_bytes)
        .map_err(|e| format!("Failed to build decryptor: {}", e))?
        .with_policy(&p, None, helper)
        .map_err(|e| format!("Failed to create decryptor: {}", e))?;

    decryptor
        .read_to_end(&mut plaintext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("Decrypted data is not valid UTF-8: {}", e))
}

fn base64_encode_simple(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data)
}

#[tauri::command]
pub fn encrypt(plaintext: String, public_key_armored: String) -> Result<String, String> {
    encrypt_message(&plaintext, &public_key_armored)
}
