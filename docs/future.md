# Velo Development Roadmap

> **Offline-first, local-first.** SQLite + Rust + React 19. Every feature in this roadmap works without internet unless explicitly noted.

---

## Current State (v0.4.21)

### Already Built

| Area | What Exists | Key Files |
|------|-------------|-----------|
| **i18n** | i18next, 3 locales (en/fr/ar), RTL support | `src/locales/i18n.ts`, `src/locales/{en,fr,ar}/translation.json` |
| **Contact Intelligence** | Tags + tag pivot, groups + group pivot, segments, activity timeline, merge/unify, Gravatar, CSV import (Rust) | `src/services/contacts/{tags,groups,segments,activity,merge,gravatar}.ts`, `src-tauri/src/contacts/csv.rs` |
| **Campaigns** | Campaign CRUD, recipient tracking, template variable resolution, send-via-queue | `src/services/campaigns/{campaignService,templateVariables,trackingService}.ts`, `src/services/db/{campaigns,campaignRecipients}.ts`, `src/stores/campaignStore.ts` |
| **Workflow Engine** | Trigger/action rules (time-based, message events), cron scheduler, 7 action types | `src/services/workflows/{workflowEngine,workflowScheduler}.ts`, `src/services/db/workflowRules.ts`, `src/components/settings/{WorkflowEditor,WorkflowTriggerPicker,WorkflowActionPicker,WorkflowRuleCard,WorkflowPresetList}.tsx` |
| **PGP (partial)** | Key gen (Rust), encrypt, key storage in SQLite, basic `PgpKeyManager` UI | `src-tauri/src/pgp/{crypto,keyring}.rs`, `src/services/pgp/pgpService.ts`, `src/services/db/pgpKeys.ts`, `src/components/settings/PgpKeyManager.tsx` |
| **Smart Labels** | AI auto-labeling rules, two-phase matching (criteria + AI), backfill service | `src/services/smartLabels/{smartLabelService,smartLabelManager,backfillService}.ts`, `src/components/settings/SmartLabelEditor.tsx` |
| **Rust Backend** | IMAP client (async-imap + raw TCP fallback), SMTP (lettre), OAuth PKCE server, system tray, CSV parse, PGP, splash screen | `src-tauri/src/{commands,imap,smtp,oauth,pgp,contacts}.rs` |
| **Database** | SQLite via `@tauri-apps/plugin-sql`, 27 migrations, 37 tables, FTS5 on messages | `src/services/db/{connection,migrations,...}.ts` |

### Existing Patterns (Reference for All New Code)

| Pattern | Convention | Example |
|---------|-----------|---------|
| **Primary keys** | `crypto.randomUUID()` | `const id = crypto.randomUUID()` |
| **Timestamps** | `unixepoch()` in SQL, `Math.floor(Date.now() / 1000)` in JS | `created_at INTEGER DEFAULT (unixepoch())` |
| **Booleans** | INTEGER 0/1 | `is_active INTEGER DEFAULT 1` |
| **Zustand stores** | `create<T>()((set, get) => ({}))` | `src/stores/labelStore.ts`, `src/stores/composerStore.ts` |
| **DB service files** | Plain async functions, `getDb()` singleton | `src/services/db/templates.ts` |
| **Dynamic updates** | `buildDynamicUpdate(table, idColumn, id, fields)` | `src/services/db/connection.ts:16` |
| **Transactions** | `withTransaction(async (db) => { ... })` | `src/services/db/connection.ts:48` |
| **Select first** | `selectFirstBy<T>(query, params)` | `src/services/db/connection.ts:87` |
| **Exists check** | `existsBy(query, params)` | `src/services/db/connection.ts:99` |
| **Tauri invoke** | `invoke("command_name", { arg })` | `src/services/pgp/pgpService.ts` |
| **Rust commands** | `#[tauri::command]` in `commands.rs` or module, register in `lib.rs` `generate_handler![]` | `src-tauri/src/commands.rs` |
| **Background checkers** | `createBackgroundChecker(name, fn, intervalMs)` | `src/services/backgroundCheckers.ts` |
| **Offline ops** | `emailActions.ts` — optimistic UI + local DB + `enqueuePendingOperation()` | `src/services/emailActions.ts` |
| **Rust deps** | sequoia-openpgp 2.2, async-imap 0.10, lettre 0.11, tokio 1, base64 0.22 | `src-tauri/Cargo.toml` |
| **Capabilities** | New plugin needs entry in `src-tauri/capabilities/default.json` | `capabilities/default.json` |
| **Migrations** | `const MIGRATIONS = [{ version: N, description, sql }]` in `migrations.ts` | `src/services/db/migrations.ts` |
| **i18n keys** | `useTranslation()` → `t("key")`, keys in `locales/*/translation.json` | `src/components/email/ContactSidebar.tsx` |
| **Windows allowed** | `"main"`, `"splashscreen"`, `"thread-*"`, `"compose-*"` | `capabilities/default.json` |

---

## Phase 1: Complete PGP Decryption *(Week 1)*

### The Gap
`decrypt_message()` in `src-tauri/src/pgp/crypto.rs:43` is a stub returning `Ok("Decrypted message".to_string())`. Encrypted emails are undecryptable.

### Rust: Implement decrypt_message

**File:** `src-tauri/src/pgp/crypto.rs`

Replace the stub:

```rust
pub fn decrypt_message(
    ciphertext_b64: &str,
    private_key_armored: &str,
    passphrase: &str,
) -> Result<String, String> {
    use openpgp::parse::Parse;
    use openpgp::policy::StandardPolicy;
    use openpgp::serialize::stream::{Decryptor, Verifier, Message};

    let policy = StandardPolicy::new();

    // Parse the armored private key
    let cert = openpgp::Cert::from_bytes(private_key_armored.as_bytes())
        .map_err(|e| format!("Parse private key failed: {}", e))?;

    // Unlock the TSK with passphrase
    let key = cert
        .as_tsk()
        .keys()
        .unencrypted_secret()
        .for_storage_encryption()
        .next()
        .ok_or_else(|| "No suitable decryption key found".to_string())?;

    use openpgp::crypto::Password;
    let pwd = Password::from(passphrase);
    let decrypted_key = key
        .decrypt_secret(&pwd)
        .map_err(|e| format!("Passphrase decryption failed: {}", e))?;

    // Decode base64 ciphertext
    use base64::Engine;
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    // Decrypt
    let mut plaintext = Vec::new();
    let message = Message::new(&ciphertext[..]);
    let mut decryptor = Decryptor::new(message, &policy, None::<(Verifier<()>, _)>)
        .map_err(|e| format!("Decryptor creation failed: {}", e))?;

    use std::io::Read;
    decryptor
        .read_to_end(&mut plaintext)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}
```

**Tauri command** — add to same file:

```rust
#[tauri::command]
pub fn decrypt(ciphertext_b64: String, private_key_armored: String, passphrase: String) -> Result<String, String> {
    decrypt_message(&ciphertext_b64, &private_key_armored, &passphrase)
}
```

**Registration** — add `pgp::crypto::decrypt` to `generate_handler![]` in `src-tauri/src/lib.rs:91`.

### Rust: Passphrase Cache

**New file:** `src-tauri/src/pgp/cache.rs`

```rust
use std::collections::HashMap;
use std::time::{Duration, Instant};
use std::sync::Mutex;
use once_cell::sync::Lazy;

// once_cell is re-exported via sequoia; add to Cargo.toml if needed
struct CachedEntry {
    passphrase: String,
    cached_at: Instant,
}

static PASSPHRASE_CACHE: Lazy<Mutex<HashMap<String, CachedEntry>>> = Lazy::new(|| Mutex::new(HashMap::new()));
const CACHE_TTL: Duration = Duration::from_secs(900); // 15 minutes

pub fn cache_passphrase(key_id: &str, passphrase: &str) {
    let mut cache = PASSPHRASE_CACHE.lock().unwrap();
    cache.insert(
        key_id.to_string(),
        CachedEntry { passphrase: passphrase.to_string(), cached_at: Instant::now() },
    );
}

pub fn get_cached_passphrase(key_id: &str) -> Option<String> {
    let mut cache = PASSPHRASE_CACHE.lock().unwrap();
    if let Some(entry) = cache.get(key_id) {
        if entry.cached_at.elapsed() < CACHE_TTL {
            return Some(entry.passphrase.clone());
        }
        cache.remove(key_id);
    }
    None
}

pub fn clear_passphrase_cache() {
    let mut cache = PASSPHRASE_CACHE.lock().unwrap();
    cache.clear();
}

#[tauri::command]
pub fn cache_passphrase_cmd(key_id: String, passphrase: String) {
    cache_passphrase(&key_id, &passphrase);
}

#[tauri::command]
pub fn clear_passphrase_cache_cmd() {
    clear_passphrase_cache();
}
```

**Add** `mod cache;` to `src-tauri/src/pgp/mod.rs`.

Register `cache_passphrase_cmd` and `clear_passphrase_cache_cmd` in `lib.rs`.

**Cargo.toml** — add `once_cell = "1"` to dependencies (or use `std::sync::LazyLock` if MSRV is 1.80+ — current is 1.77.2, so stick with `once_cell`).

### Service Layer

**File:** `src/services/pgp/pgpService.ts`

Add:

```typescript
export async function decryptMessage(
  ciphertextB64: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<string> {
  return invoke("decrypt", { ciphertextB64, privateKeyArmored, passphrase });
}

export async function cachePgpPassphrase(keyId: string, passphrase: string): Promise<void> {
  return invoke("cache_passphrase_cmd", { keyId, passphrase });
}

export async function clearPgpPassphraseCache(): Promise<void> {
  return invoke("clear_passphrase_cache_cmd");
}

export async function decryptWithCachedPassphrase(
  ciphertextB64: string,
  privateKeyArmored: string,
  keyId: string,
): Promise<string> {
  return invoke("decrypt_with_cache", { ciphertextB64, privateKeyArmored, keyId });
}
```

### UI: EncryptedMessageBanner

**New file:** `src/components/email/EncryptedMessageBanner.tsx`

Detect `-----BEGIN PGP MESSAGE-----` in message body. Show banner with "Decrypt" button. On click:
1. Check passphrase cache (via `decryptWithCachedPassphrase`)
2. If cached miss → show passphrase dialog (modal with key ID selector and passphrase input + "Remember for 15 min" checkbox)
3. Call `decryptMessage()` → render decrypted plaintext in a sandboxed iframe (same `EmailRenderer` sanitization via DOMPurify)

**Security rule:** Decrypted plaintext stored in Zustand component state only (new `decryptedBodies: Record<string, string>` field on the reading pane component, NOT in composerStore). Cleared on thread change. Never written to SQLite.

**New file:** `src/components/email/PassphraseDialog.tsx` — modal with key selector (from `pgpKeys` table), passphrase input, remember toggle.

### i18n

Add to all three `translation.json` files:
```json
{
  "pgp": {
    "encryptedSubject": "Encrypted Message",
    "decrypt": "Decrypt",
    "enterPassphrase": "Enter passphrase for key {keyId}",
    "rememberPassphrase": "Remember for 15 minutes",
    "decryptionFailed": "Decryption failed. Wrong passphrase or corrupted message."
  }
}
```

### Store: No new store needed

Decrypted content lives in component-local state within `EncryptedMessageBanner` / `ThreadView`. Use `useState()` pattern like `ContactSidebar` does for ephemeral state.

---

## Phase 2: Compliance Engine *(Weeks 2–3)*

### The Gap
No compliance checking. Users send emails across jurisdictions (GDPR, CAN-SPAM, LGPD, Morocco's Law 31-08) with zero guardrails.

### Architecture
A **jurisdiction-aware rule engine** — compliance profiles are JSON rule sets stored in SQLite. The engine detects recipient TLD/domain and applies matching profiles. Evaluated locally in `src/services/compliance/`.

### Database (Migration v28)

**File:** `src/services/db/migrations.ts`

```sql
CREATE TABLE IF NOT EXISTS compliance_profiles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  region_hint TEXT,
  rules_json TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS compliance_checks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email_draft_id TEXT REFERENCES local_drafts(id),
  campaign_id TEXT REFERENCES campaigns(id),
  profile_ids TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 100,
  violations_json TEXT,
  checked_at INTEGER DEFAULT (unixepoch())
);
```

### Types

**New file:** `src/services/compliance/types.ts`

```typescript
export type ComplianceRuleType =
  | "signature_required"
  | "unsubscribe_required"
  | "disclaimer_required"
  | "tone_check"
  | "data_minimization"
  | "retention_notice"
  | "custom_regex"
  | "attachment_mentioned";

export type RuleSeverity = "error" | "warning" | "info";

export interface ComplianceRule {
  id: string;
  type: ComplianceRuleType;
  severity: RuleSeverity;
  messageKey: string;
  config?: {
    field?: string;
    regex?: string;
    minWords?: number;
    domains?: string[];
  };
}

export interface ComplianceProfile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  regionHint: string | null;
  rules: ComplianceRule[];
  isActive: boolean;
  isDefault: boolean;
}

export interface ComplianceViolation {
  ruleId: string;
  severity: RuleSeverity;
  messageKey: string;
  field?: string;
  fixAction?: string;
}

export interface ComplianceCheckResult {
  profileId: string;
  score: number;
  violations: ComplianceViolation[];
}
```

### DB Service

**New file:** `src/services/db/complianceProfiles.ts`

```typescript
import { getDb, selectFirstBy } from "./connection";
import type { ComplianceProfile, ComplianceRule } from "@/services/compliance/types";

export async function getActiveProfiles(): Promise<ComplianceProfile[]> { /* ... */ }
export async function getProfilesForDomains(domains: string[]): Promise<ComplianceProfile[]> { /* ... */ }
export async function upsertProfile(profile: ComplianceProfile): Promise<void> { /* ... */ }
export async function insertCheck(check: { accountId: string; draftId?: string; campaignId?: string; profileIds: string; score: number; violationsJson: string }): Promise<string> { /* ... */ }
```

**New file:** `src/services/db/complianceChecks.ts`

```typescript
export async function getRecentChecks(accountId: string, limit?: number): Promise<DbComplianceCheck[]> { /* ... */ }
export async function deleteOldChecks(before: number): Promise<void> { /* ... */ }
```

### Rule Engine

**New file:** `src/services/compliance/ruleEngine.ts`

```typescript
import type { ComplianceProfile, ComplianceRule, ComplianceViolation, ComplianceCheckResult } from "./types";

export function detectJurisdiction(recipients: { email: string }[], profiles: ComplianceProfile[]): ComplianceProfile[] {
  // Check recipient TLDs against profile.regionHint
  // Return matching profiles (can be multiple)
}

export function evaluateRules(profile: ComplianceProfile, context: {
  subject: string;
  bodyHtml: string;
  senderEmail: string;
  recipients: { email: string; displayName?: string }[];
  hasSignature: boolean;
  hasUnsubscribe: boolean;
  hasAttachments: boolean;
}): ComplianceCheckResult {
  // Evaluate each rule against context
  // Returns score 0-100 + violations array
}
```

### AI Integration (Optional Enhancement)

**New file:** `src/services/compliance/aiEnhancer.ts`

Use existing `aiService.ts` with a local prompt template:

```
You are a compliance assistant. The following email is being sent under [PROFILE_NAME].
Recipient jurisdiction: [JURISDICTION]
Rules: [RULES_JSON]
Email subject: [SUBJECT]
Email body: [BODY]
Check for violations and suggest fixes. Respond in [LOCALE].
```

If offline, rule engine still works 100% via regex and local checks. AI is purely additive for tone analysis.

### Built-in Profiles (Seeded on Migration)

In migration v28, insert default profiles via SQL `INSERT OR IGNORE`:

| code | name | region_hint | Key Rules |
|------|------|-------------|-----------|
| `ma` | Morocco Business | `.ma` | RC/IF/ICE/CNSS in signature; formal French tone; no excessive Darija |
| `gdpr` | GDPR (EU) | `.fr,.de,.es,.it,.nl,.be,.at,.eu,.lu,.fi,.se,.dk,.ie,.pt,.gr,.pl,.cz,.hu,.ro,.bg,.hr,.sk,.si,.lt,.lv,.ee` | Unsubscribe link required; data retention notice; lawful basis mention |
| `can-spam` | CAN-SPAM (US) | `.us,.com,.org,.net` | Physical address in signature; clear subject; 10-day opt-out |
| `lgpd` | LGPD (Brazil) | `.br` | Portuguese-language requirements; data subject rights notice |
| `generic` | Professional | (all) | No ALL-CAPS subject; attachment mentioned in body; signature present |

### UI: CompliancePanel

**New file:** `src/components/composer/CompliancePanel.tsx`

- Real-time score badge (0–100): green (≥90), yellow (70–89), red (<70)
- Expandable violation list with one-click fix actions:
  - "Add missing RC number" → inserts `{{rc_number}}` placeholder in signature
  - "Insert unsubscribe link" → appends `mailto:unsubscribe@` footer
  - "Add physical address" → prompts to complete signature
  - "Fix subject case" → title-cases subject
- Score appears in composer toolbar as `Shield` icon with color

### UI: ComplianceProfileManager

**New file:** `src/components/settings/ComplianceProfileManager.tsx`

- List of profiles with enable/disable toggles
- Edit custom rules (add/remove/reorder)
- Import/export profile as JSON file
- Default profile selector

### Campaign Integration

In `src/services/campaigns/campaignService.ts`, after `sendCampaign()`:
- Check all campaign emails against applicable profiles
- If any recipient has score < 70 and profile has `block_on_error`, prevent send and show violations

---

## Phase 3: Advanced Template Library *(Weeks 3–4)*

### The Gap
Templates exist (`src/services/db/templates.ts`, `src/components/composer/TemplatePicker.tsx`) but are flat — no categories, no conditional blocks, no usage tracking, no quick-insert from TipTap.

### Database (Migration v29)

**File:** `src/services/db/migrations.ts`

```sql
CREATE TABLE IF NOT EXISTS template_categories (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_system INTEGER DEFAULT 0
);

-- Migrate existing templates
ALTER TABLE templates ADD COLUMN category_id TEXT REFERENCES template_categories(id);
ALTER TABLE templates ADD COLUMN is_favorite INTEGER DEFAULT 0;
ALTER TABLE templates ADD COLUMN usage_count INTEGER DEFAULT 0;
ALTER TABLE templates ADD COLUMN last_used_at INTEGER;
ALTER TABLE templates ADD COLUMN conditional_blocks_json TEXT;
```

### DB Service Updates

**File:** `src/services/db/templates.ts`

Add:
```typescript
export interface DbTemplateCategory { id: string; name: string; icon: string | null; sortOrder: number; isSystem: boolean; }
export async function getCategories(accountId: string): Promise<DbTemplateCategory[]> { /* ... */ }
export async function upsertCategory(cat: { id?: string; name: string; icon?: string; sortOrder?: number; isSystem?: boolean }): Promise<string> { /* ... */ }
export async function deleteCategory(id: string): Promise<void> { /* ... */ }
export async function incrementTemplateUsage(id: string): Promise<void> { /* ... */ }
export async function getFavorites(accountId: string): Promise<DbTemplate[]> { /* ... */ }
```

### Template Variables v2

**File:** `src/services/campaigns/templateVariables.ts`

Extend `resolvedVariables` with:
- `{{my_name}}`, `{{my_title}}`, `{{my_phone}}` — from account signature settings (`src/services/db/signatures.ts`)
- `{{date}}`, `{{date_long}}` — localized via i18n (`formatRelativeDate` from `src/utils/date.ts`)
- `{{day_of_week}}` — `new Date().toLocaleDateString(locale, { weekday: 'long' })`
- `{{random_greeting}}` — rotates: `["Bonjour", "Salam", "Hello", "Dear"]` based on locale

Add **conditional block evaluation:**

```typescript
export function evaluateConditionalBlocks(template: string, vars: Record<string, string>): string {
  // Replace {{#if var}}...{{else}}...{{/if}} blocks
  return template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\n?\{\{\/if\}\}/g, (_, varName, thenBlock, elseBlock) => {
    return vars[varName] ? thenBlock : (elseBlock ?? "");
  });
}
```

### TemplatePicker v2

**File:** `src/components/composer/TemplatePicker.tsx`

Rewrite to add:
- Category tabs (ribbon at top: All, Sales, Support, Legal, Marketing, Internal)
- Fuzzy search across name + content
- Favorites section (pinned via `is_favorite`)
- Usage-count sorting (most-used at top)
- Category management (add/edit/delete categories)
- Drag-and-drop reorder within categories

### Quick-Insert (Slash Command in TipTap)

**File:** `src/components/composer/EditorToolbar.tsx` (or new `TipTapExtension`)

Register a TipTap extension (using `@tiptap/core` extension API):

```typescript
import { Extension } from "@tiptap/core";

export const TemplateSlashCommand = Extension.create({
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("template-slash"),
      props: {
        handleKeyDown(view, event) {
          if (event.key === "/" && view.state.selection.empty) {
            // Show inline template picker dropdown
            return true;
          }
          return false;
        }
      }
    })];
  }
});
```

Trigger: Type `/template` → fuzzy dropdown appears → select → inserts body + optionally sets subject.

### Template Export/Import

**New file:** `src/services/campaigns/templateShare.ts`

```typescript
export function exportTemplateToJson(template: DbTemplate): string { /* JSON.stringify */ }
export function parseImportedTemplate(json: string): { name: string; subject: string | null; bodyHtml: string } | null { /* ... */ }
export async function importFromFile(file: File): Promise<{ name: string; subject: string | null; bodyHtml: string } | null> { /* FileReader + parse */ }
```

---

## Phase 4: Attachment Vault & Contact File Intelligence *(Weeks 4–5)*

### The Gap
Attachments are cached (`src/services/attachments/cacheManager.ts`) but scattered. No per-contact organization, no auto-categorization, no full-text indexing of invoice/contract content.

### Architecture: Local File Vault

Extend existing `AttachmentLibrary` and `attachments` table into a **Contact File Vault**.

### Filesystem Structure (Rust-managed)

```
$APPDATA/velo/vault/
  {account_id}/
    {contact_email_hash}/
      invoices/
      contracts/
      receipts/
      general/
    uncategorized/
```

New Rust module at `src-tauri/src/vault/`:

| File | Purpose |
|------|---------|
| `src-tauri/src/vault/mod.rs` | Module declaration |
| `src-tauri/src/vault/ops.rs` | `copy_to_vault`, `list_vault`, `delete_from_vault`, `get_vault_path` |
| `src-tauri/src/vault/pdf.rs` | PDF text extraction using `lopdf` or `pdf-extract` |

**Cargo.toml additions:**
```toml
lopdf = "0.34"
```

### Rust: Vault Operations

**File:** `src-tauri/src/vault/ops.rs`

```rust
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn get_vault_root(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("vault");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.to_str().map(|s| s.to_string()).ok_or_else(|| "Invalid path".to_string())
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
```

**File:** `src-tauri/src/vault/pdf.rs`

```rust
#[tauri::command]
pub fn extract_pdf_text(file_path: String) -> Result<String, String> {
    let doc = lopdf::Document::load(&file_path).map_err(|e| e.to_string())?;
    let mut text = String::new();
    for page in &doc.page_iter() {
        if let Ok(content) = doc.extract_text(&[page.number]) {
            text.push_str(&content);
            text.push('\n');
        }
    }
    Ok(text)
}
```

Register all vault commands in `src-tauri/src/lib.rs` `generate_handler![]`.

### DB Service

**New file:** `src/services/db/contactFiles.ts`

```typescript
import { getDb } from "./connection";

export interface DbContactFile {
  id: string;
  contact_id: string;
  message_id: string;
  original_filename: string;
  stored_path: string;
  file_size: number;
  mime_type: string | null;
  category: string;
  extracted_text: string | null;
  is_starred: number;
  saved_at: number;
}

export async function saveContactFile(f: {
  contactId: string; messageId: string; originalFilename: string;
  storedPath: string; fileSize: number; mimeType: string | null; category?: string;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO contact_files (id, contact_id, message_id, original_filename, stored_path, file_size, mime_type, category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, f.contactId, f.messageId, f.originalFilename, f.storedPath, f.fileSize, f.mimeType, f.category ?? "general"],
  );
  return id;
}

export async function getContactFiles(contactId: string, category?: string): Promise<DbContactFile[]> { /* ... */ }
export async function searchContactFiles(query: string): Promise<DbContactFile[]> { /* ... */ }
export async function updateFileCategory(id: string, category: string): Promise<void> { /* ... */ }
export async function toggleFileStarred(id: string): Promise<void> { /* ... */ }
export async function deleteContactFile(id: string): Promise<void> { /* ... */ }
```

### Database (Migration v30)

**File:** `src/services/db/migrations.ts`

```sql
CREATE TABLE IF NOT EXISTS contact_files (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  extracted_text TEXT,
  is_starred INTEGER DEFAULT 0,
  saved_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_contact_files_contact ON contact_files(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_files_category ON contact_files(category);
```

NOTE: FTS5 index on `contact_files` is deferred to Phase 6 (unified search).

### Auto-Categorization Service

**New file:** `src/services/attachments/vaultCategorizer.ts`

```typescript
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/facture|invoice|bill|quote|devis|factura/i, "invoices"],
  [/contrat|contract|agreement|convenio/i, "contracts"],
  [/reçu|receipt|recibo|paiement|payment/i, "receipts"],
  [/cv|resume|curriculum/i, "general"],
  [/photo|img_|image|screenshot|capture/i, "images"],
];

export function categorizeByFilename(filename: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(filename)) return category;
  }
  return "general";
}

export function extractKeywordsForCategory(text: string): string {
  // Simple keyword matching on extracted PDF text
  if (/facture|invoice|tva|vat|total/i.test(text)) return "invoices";
  if (/contrat|clause|parties|agreement/i.test(text)) return "contracts";
  return "general";
}
```

### Vault Service

**New file:** `src/services/attachments/vaultService.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import { getContactByEmail } from "@/services/db/contacts";
import { getMessageById } from "@/services/db/messages";
import { saveContactFile, getContactFiles } from "@/services/db/contactFiles";
import { categorizeByFilename } from "./vaultCategorizer";

export async function saveAttachmentToVault(
  accountId: string,
  messageId: string,
  contactEmail: string,
  filename: string,
  sourcePath: string,
  fileSize: number,
  mimeType: string | null,
): Promise<string> {
  const contact = await getContactByEmail(contactEmail);
  if (!contact) throw new Error("Contact not found");

  const vaultRoot = await invoke<string>("get_vault_root");
  const emailHash = await sha256Short(contactEmail); // simple hash for directory name
  const category = categorizeByFilename(filename);
  const vaultPath = `${vaultRoot}/${accountId}/${emailHash}/${category}/${filename}`;

  await invoke("copy_to_vault", { sourcePath, vaultPath });

  return saveContactFile({
    contactId: contact.id,
    messageId,
    originalFilename: filename,
    storedPath: vaultPath,
    fileSize,
    mimeType,
    category,
  });
}

async function sha256Short(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input.toLowerCase().trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash.slice(0, 8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

### UI: Contact Sidebar "Files" Tab

**File:** `src/components/email/ContactSidebar.tsx`

Add a "Files" tab next to existing Activity/Tags tabs:

```typescript
const [activeTab, setActiveTab] = useState<"activity" | "tags" | "files">("activity");
const [contactFiles, setContactFiles] = useState<DbContactFile[]>([]);

// When activeTab === "files", load `getContactFiles(contact.id)`
// Show category folders (Invoices, Contracts, Receipts, All) with file list
// Each file row: icon, filename, size, date, star toggle
// Click → open file (via `tauri-plugin-opener` or internal viewer)
```

### UI: "Save to Vault" Button on Attachments

**File:** `src/components/email/AttachmentList.tsx`

Add button on each attachment row: `Save to Vault` icon. On click:
1. Determine sender email from message context
2. Get local path from `DbAttachment.local_path` or fetch from IMAP/Gmail
3. Call `saveAttachmentToVault()`
4. Show toast: "Saved to {contact}'s vault"

### UI: AttachmentLibrary v2

**File:** `src/components/attachments/AttachmentLibrary.tsx` (extends existing)

Add vault browser mode:
- Filters: by contact (searchable), by category (tabs), by date range, by file type
- Bulk actions: multi-select → export ZIP, change category, delete
- Search across filenames and extracted text
- Preview pane: show file metadata + PDF text extract (if available)

---

## Phase 5: Backup & Export *(Weeks 5–6)*

### The Gap
No way to export emails for legal hold, migration, or local backup. All data trapped in SQLite.

### Architecture: Rust-Driven Export Engine

Heavy lifting in Rust (file I/O, MBOX format, ZIP encryption). React triggers and shows progress via Tauri events.

### Rust Module: Export

**New directory:** `src-tauri/src/export/`

| File | Purpose |
|------|---------|
| `mod.rs` | Module declaration |
| `mbox.rs` | MBOX writer — appends RFC 2822 messages to Unix mbox file |
| `zip.rs` | Encrypted ZIP writer using `zip` crate + AES |
| `pdf.rs` | HTML→PDF via headless printing (`printpdf` crate or webbrowser print) |
| `scheduler.rs` | Async tokio task that checks cron and executes backups |
| `types.rs` | Shared types: `ExportFormat`, `ExportConfig`, `BackupSchedule` |

**Cargo.toml additions:**
```toml
zip = { version = "2", features = ["aes-crypto"] }
printpdf = "0.7"
cron = "0.13"
```

**File:** `src-tauri/src/export/types.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum ExportFormat {
    Mbox,
    Eml,
    Pdf,
    Zip,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportConfig {
    pub format: ExportFormat,
    pub account_id: String,
    pub filter_query: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub destination: String,
    pub encrypt: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSchedule {
    pub id: String,
    pub account_id: String,
    pub name: String,
    pub format: String,
    pub filter_query: Option<String>,
    pub destination_path: String,
    pub schedule_cron: String,
    pub encrypt: bool,
    pub is_active: bool,
}
```

**File:** `src-tauri/src/export/mbox.rs`

```rust
use std::fs::OpenOptions;
use std::io::Write;

pub fn append_to_mbox(file_path: &str, message_rfc2822: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(file_path)
        .map_err(|e| e.to_string())?;

    // MBOX "From " line (note trailing space)
    writeln!(file, "From mail@velo.app Mon Jan 01 00:00:00 2024").map_err(|e| e.to_string())?;

    // Escape lines beginning with "From "
    let escaped = message_rfc2822.replace("\nFrom ", "\n>From ");
    write!(file, "{}\n\n", escaped).map_err(|e| e.to_string())?;

    Ok(())
}
```

**File:** `src-tauri/src/export/scheduler.rs`

```rust
use tokio::time::{interval, Duration};
use tauri::{AppHandle, Emitter};

pub async fn run_backup_scheduler(app: AppHandle) {
    let mut ticker = interval(Duration::from_secs(60)); // check every minute
    loop {
        ticker.tick().await;
        // Query active backup_schedules from SQLite via JS invoke
        // Check cron match using `cron` crate
        // Execute backup:
        //   1. Fetch messages matching filter from SQLite
        //   2. Write to mbox/zip based on format
        //   3. Emit progress event: app.emit("backup-progress", payload)
        //   4. Update last_run_at / next_run_at in SQLite
    }
}
```

**Commands** — add to `src-tauri/src/commands.rs` or a new `export/commands.rs`:

```rust
#[tauri::command]
pub async fn export_messages(config: ExportConfig, app: AppHandle) -> Result<(), String> { /* ... */ }

#[tauri::command]
pub async fn start_backup_scheduler(app: AppHandle) -> Result<(), String> {
    tokio::spawn(run_backup_scheduler(app));
    Ok(())
}
```

**Note:** The backup scheduler spawned via `tokio::spawn` in a Tauri command will be tied to the command invocation. For a persistent background task, use `app.manage()` in `setup` to store a handle and spawn in `lib.rs` setup closure.

### Database (Migration v31)

**File:** `src/services/db/migrations.ts`

```sql
CREATE TABLE IF NOT EXISTS backup_schedules (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'mbox',
  filter_query TEXT,
  destination_path TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,
  encrypt INTEGER DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  is_active INTEGER DEFAULT 1
);
```

### Service

**New file:** `src/services/export/exportService.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "@/services/db/connection";

export interface ExportConfig {
  format: "mbox" | "eml" | "pdf" | "zip";
  accountId: string;
  filterQuery?: string;
  dateFrom?: number;
  dateTo?: number;
  destination: string;
  encrypt: boolean;
}

export async function exportMessages(config: ExportConfig): Promise<void> {
  await invoke("export_messages", { config });
}

export async function scheduleBackup(schedule: {
  accountId: string; name: string; format: string;
  filterQuery?: string; destinationPath: string;
  scheduleCron: string; encrypt: boolean;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO backup_schedules (id, account_id, name, format, filter_query, destination_path, schedule_cron, encrypt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, schedule.accountId, schedule.name, schedule.format, schedule.filterQuery ?? null,
     schedule.destinationPath, schedule.scheduleCron, schedule.encrypt ? 1 : 0],
  );
  return id;
}

export async function getSchedules(accountId: string): Promise<BackupSchedule[]> { /* ... */ }
export async function toggleSchedule(id: string, active: boolean): Promise<void> { /* ... */ }
export async function deleteSchedule(id: string): Promise<void> { /* ... */ }
export async function runBackupNow(id: string): Promise<void> { /* ... */ }
```

### Progress Events (Rust → React)

Rust emits via `app.emit("backup-progress", ...)` — type-safe via `serde`:

```rust
#[derive(Clone, Serialize)]
struct BackupProgress {
    total: u32,
    processed: u32,
    current_message: Option<String>,
    status: String,
}
```

React listens:

```typescript
import { listen } from "@tauri-apps/api/event";

useEffect(() => {
  const unlisten = listen<BackupProgress>("backup-progress", (event) => {
    setProgress(event.payload);
  });
  return () => { unlisten.then((f) => f()); };
}, []);
```

### UI: ExportDialog

**New file:** `src/components/email/ExportDialog.tsx`

- Wizard-style: Step 1 (pick format), Step 2 (pick filter / date range), Step 3 (destination folder via `tauri-plugin-dialog`), Step 4 (encrypt toggle, confirm)
- Progress bar during export
- "Open destination folder" button on completion

### UI: BackupSchedulerSettings

**New file:** `src/components/settings/BackupSchedulerSettings.tsx`

- List schedules with enable/disable toggles
- "New Schedule" button
- Each schedule row: name, format icon, cron expression (human-readable), last run, next run
- "Run Now" button per schedule
- Edit / delete actions

---

## Phase 6: Velo Vault Integration *(Week 6 — Polish)*

### Unified FTS5 Search

**File:** `src/services/db/migrations.ts` (Migration v32)

Extend FTS5 to index `contact_files`:

```sql
-- Rebuild FTS index on contact_files.extracted_text
-- Since FTS5 cannot be added via ALTER TABLE, we use a separate virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS contact_files_fts USING fts5(
  file_id UNINDEXED,
  original_filename,
  extracted_text,
  content='contact_files',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS contact_files_ai AFTER INSERT ON contact_files BEGIN
  INSERT INTO contact_files_fts(rowid, file_id, original_filename, extracted_text)
  VALUES (new.rowid, new.id, new.original_filename, new.extracted_text);
END;

CREATE TRIGGER IF NOT EXISTS contact_files_ad AFTER DELETE ON contact_files BEGIN
  INSERT INTO contact_files_fts(contact_files_fts, rowid, file_id, original_filename, extracted_text)
  VALUES ('delete', old.rowid, old.id, old.original_filename, old.extracted_text);
END;

CREATE TRIGGER IF NOT EXISTS contact_files_au AFTER UPDATE ON contact_files BEGIN
  INSERT INTO contact_files_fts(contact_files_fts, rowid, file_id, original_filename, extracted_text)
  VALUES ('delete', old.rowid, old.id, old.original_filename, old.extracted_text);
  INSERT INTO contact_files_fts(rowid, file_id, original_filename, extracted_text)
  VALUES (new.rowid, new.id, new.original_filename, new.extracted_text);
END;
```

### Unified Search Service

**File:** `src/services/db/search.ts`

Extend `searchMessages()` to also query `contact_files_fts` when the query has no operator prefix (free text):

```typescript
export interface UnifiedSearchResult {
  type: "message" | "contact_file" | "task" | "contact";
  id: string;
  title: string;
  snippet: string | null;
  date: number;
  rank: number;
}

export async function unifiedSearch(query: string, accountId?: string): Promise<UnifiedSearchResult[]> {
  const results: UnifiedSearchResult[] = [];

  // Search messages (existing FTS5)
  const messages = await searchMessages(query, accountId);
  results.push(...messages.map((m) => ({ type: "message" as const, id: m.message_id, ... })));

  // Search contact files (new FTS5)
  const db = await getDb();
  const files = await db.select<{ file_id: string; original_filename: string; extracted_text: string; rank: number }[]>(
    `SELECT file_id, original_filename, extracted_text, rank
     FROM contact_files_fts
     WHERE contact_files_fts MATCH $1
     ORDER BY rank
     LIMIT 20`,
    [query],
  );
  results.push(...files.map((f) => ({ type: "contact_file" as const, id: f.file_id, ... })));

  return results.sort((a, b) => b.rank - a.rank).slice(0, 50);
}
```

### Dashboard (Optional)

**New component:** `src/components/layout/BusinessDashboard.tsx`

If navigated to via a new nav item "Business" (or a collapsible section), show:

| Section | Source | Query |
|---------|--------|-------|
| Pending compliance checks | `compliance_checks` | `WHERE score < 100 ORDER BY checked_at DESC LIMIT 5` |
| Recent vault activity | `contact_files` | `ORDER BY saved_at DESC LIMIT 10` |
| Upcoming scheduled campaigns | `campaigns` | `WHERE status = 'draft' ORDER BY created_at DESC LIMIT 5` |
| Follow-up reminders | `follow_up_reminders` | `WHERE is_dismissed = 0 ORDER BY remind_at ASC LIMIT 5` |
| Next scheduled backup | `backup_schedules` | `WHERE is_active = 1 ORDER BY next_run_at ASC LIMIT 3` |

Each section is a small card with count badge and click-through to the relevant settings page.

**Routing:** Add `/business` route in `src/router/`. Add "Business" nav item in `src/components/layout/Sidebar.tsx` under a "More" collapsible section (or as a standalone item if space permits).

---

## Migration Version Summary

| Version | Phase | Description | New Tables |
|---------|-------|-------------|------------|
| 28 | P2 | Compliance profiles & checks | `compliance_profiles`, `compliance_checks` |
| 29 | P3 | Template categories & template enhancements | `template_categories`; ALTER `templates` |
| 30 | P4 | Contact file vault | `contact_files` |
| 31 | P5 | Backup schedules | `backup_schedules` |
| 32 | P6 | FTS5 index on contact files | `contact_files_fts` (virtual) |

---

## Capabilities & Permissions

Each phase that adds Rust plugins needs entries in `src-tauri/capabilities/default.json`:

| Phase | New Permission | Reason |
|-------|---------------|--------|
| P1 | — | No new plugin (std crypto only) |
| P4 | `fs:allow-copy-file` | Vault file operations |
| P4 | `dialog:allow-open` | Pick vault directory |
| P5 | `dialog:allow-save` | Export destination picker |
| P5 | `fs:allow-write-text-file` | MBOX/ZIP write |
| P6 | — | No new plugin |

---

## i18n Keys to Add

| Phase | Key Prefix | Count |
|-------|-----------|-------|
| P1 | `pgp.*` | ~6 keys |
| P2 | `compliance.*` | ~15 keys |
| P3 | `templates.*` | ~10 keys |
| P4 | `vault.*` | ~12 keys |
| P5 | `backup.*`, `export.*` | ~14 keys |
| P6 | `dashboard.*` | ~8 keys |

All keys go into `src/locales/{en,fr,ar}/translation.json`.

---

## Offline-First Guarantees

| Feature | Online Needed? | Fallback |
|---------|---------------|----------|
| PGP Decrypt | No | — |
| Compliance Rule Engine | No | Regex + local checks work 100% offline |
| AI-Enhanced Compliance | Yes | Skipped if offline; engine still runs |
| Templates | No | — |
| Attachment Vault | No | — |
| PDF Text Extraction | No | — |
| Export (MBOX/ZIP) | No | — |
| Backup Scheduler | No | Rust runs locally |
| Unified Search | No | FTS5 is local SQLite |

---

## Testing Strategy

| Phase | What to Test | Testing Approach |
|-------|-------------|------------------|
| P1 | `decrypt_message` | Rust unit test (encrypt known plaintext → decrypt → assert match) |
| P1 | Passphrase cache | Rust unit test (cache → retrieve → expire → miss) |
| P1 | `EncryptedMessageBanner` | Vitest + jsdom: render, click decrypt, verify decrypted output |
| P2 | `evaluateRules` | Pure TS unit test: feed known inputs, assert violations match |
| P2 | `detectJurisdiction` | Pure TS unit test: TLD mapping correctness |
| P2 | `CompliancePanel` | Vitest: render with score, verify color class |
| P3 | `evaluateConditionalBlocks` | Pure TS unit test |
| P3 | Template picker | Vitest: render categories, filter by search |
| P4 | `categorizeByFilename` | Pure TS unit test |
| P4 | Vault Rust ops | Rust integration test: copy file, verify path, delete |
| P4 | `ContactSidebar` Files tab | Vitest: existing tab switching, new file list rendering |
| P5 | MBOX append | Rust unit test: write 2 messages, verify file format |
| P5 | Backup scheduler cron | Rust unit test: cron matching |
| P5 | `ExportDialog` | Vitest: wizard step transitions |
| P6 | `unifiedSearch` | Integration test with seeded DB |

Follow existing test patterns: colocated `*.test.ts` files, `vitest`, `@testing-library/jest-dom/vitest` in setup.

---

## Phase Dependency Graph

```
P1 (PGP Decrypt) ── standalone, no deps
P2 (Compliance) ─── depends on: existing composerStore, existing i18n
P3 (Templates) ──── depends on: existing templateService, existing store
P4 (Vault) ──────── depends on: existing attachments service + ContactSidebar
P5 (Backup) ─────── depends on: existing messages/threads DB queries
P6 (Integration) ── depends on: P4 (contact_files FTS), P2 (dashboard compliance card), P5 (dashboard backup card)
```

P1–P5 can be worked on in parallel after the shared migration infrastructure is in place.
