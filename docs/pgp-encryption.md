# PGP Encryption

## Database Schema (Migration v27)

```sql
pgp_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  key_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT,
  passphrase_hint TEXT,
  fingerprint TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(account_id, key_id)
)
```

## Rust Backend

Uses `sequoia-openpgp` for all cryptographic operations. Source in `src-tauri/src/pgp/`:

### Key Generation (`keyring.rs`)

- `generate_key_pair(user_id, passphrase)` — Ed25519 (Cv25519) key pair via `CertBuilder`
- `get_key_info(armored_key)` — parses ASCII-armored key, returns key_id + fingerprint
- Tauri commands: `generate_key`, `get_key_info_cmd`

```rust
#[tauri::command]
pub fn generate_key(user_id: String, passphrase: String) -> Result<(String, String), String>
// Returns (public_key_armored, private_key_armored)
```

### Encryption/Decryption (`crypto.rs`)

- `encrypt_message(plaintext, public_key_armored)` — encrypts with recipient's public key using transport encryption policy
- `decrypt_message(ciphertext_b64, private_key_armored, passphrase)` — stub, returns placeholder
- Tauri command: `encrypt`

```rust
#[tauri::command]
pub fn encrypt(plaintext: String, public_key_armored: String) -> Result<String, String>
// Returns base64-encoded encrypted message
```

## Service Layer

`src/services/pgp/pgpService.ts` wraps Tauri invocations:

```ts
generatePgpKey(userId, passphrase): Promise<[publicKey, privateKey]>
getPgpKeyInfo(armoredKey): Promise<PgpKeyInfo>
encryptMessage(plaintext, publicKeyArmored): Promise<string>
```

## Database Layer

`src/services/db/pgpKeys.ts` provides CRUD for the `pgp_keys` table:

```ts
getPgpKeys(accountId): Promise<DbPgpKey[]>
savePgpKey(accountId, keyId, publicKey, privateKeyEncrypted?, passphraseHint?, fingerprint?)
deletePgpKey(id)
```

## UI

`PgpKeyManager` component in `src/components/settings/PgpKeyManager.tsx` — accessible from Settings → PGP (`activeTab === "pgp"`). Current implementation shows key list placeholder with i18n strings.
