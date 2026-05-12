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
    use openpgp::crypto::Password;
    use openpgp::parse::stream::{
        DecryptionHelper, DecryptorBuilder, MessageStructure, VerificationHelper,
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
        let key = ka.key().clone();
        let password = Password::from(passphrase);
        if let Ok(decrypted) = key.decrypt_secret(&password) {
            if let Ok(keypair) = decrypted.into_keypair() {
                keypairs.push(keypair);
            }
        }
    }

    if keypairs.is_empty() {
        let password = Password::from(passphrase);
        if let Ok(primary) = cert.primary_key().key().clone().decrypt_secret(&password) {
            if let Ok(keypair) = primary.into_keypair() {
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

    impl VerificationHelper for Helper {
        fn get_certs(
            &mut self,
            _ids: &[openpgp::KeyHandle],
        ) -> openpgp::Result<Vec<openpgp::Cert>> {
            Ok(Vec::new())
        }

        fn check(&mut self, _structure: MessageStructure) -> openpgp::Result<()> {
            Ok(())
        }
    }

    impl DecryptionHelper for Helper {
        fn decrypt(
            &mut self,
            pkesks: &[openpgp::packet::PKESK],
            _skesks: &[openpgp::packet::SKESK],
            sym_algo: Option<SymmetricAlgorithm>,
            decrypt: &mut dyn FnMut(
                Option<SymmetricAlgorithm>,
                &openpgp::crypto::SessionKey,
            ) -> bool,
        ) -> openpgp::Result<Option<openpgp::Cert>> {
            for keypair in &mut self.keypairs {
                for pkesk in pkesks {
                    if let Some((algo, session_key)) = pkesk.decrypt(keypair, sym_algo) {
                        if decrypt(algo, &session_key) {
                            return Ok(None);
                        }
                    }
                }
            }
            Ok(None)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pgp::keyring::generate_key_pair;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let (public, private) = generate_key_pair("test@example.com", "").unwrap();
        let plaintext = "Hello, this is a secret message!";
        let ciphertext = encrypt_message(plaintext, &public).unwrap();
        let decrypted = decrypt_message(&ciphertext, &private, "any-passphrase").unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_decrypt_wrong_key_fails() {
        let (public_alice, _private_alice) = generate_key_pair("alice@example.com", "").unwrap();
        let (_public_bob, private_bob) = generate_key_pair("bob@example.com", "").unwrap();

        let plaintext = "Secret for Alice only";
        let ciphertext = encrypt_message(plaintext, &public_alice).unwrap();
        let result = decrypt_message(&ciphertext, &private_bob, "anything");

        assert!(result.is_err(), "Decrypt with wrong key should fail");
    }
}
