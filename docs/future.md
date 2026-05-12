Here's the replanned roadmap — everything stays **local-first**, works offline, and respects Velo's SQLite + Rust + React architecture.

---

## Guiding Principle

> *"If it can be done locally, it stays local. If it crosses a border, the rules travel with the app."*

No companion backend required. Compliance rules, templates, attachments, and backups all live in SQLite or the local filesystem.

---

## Phase 1: Finish PGP Decryption *(Week 1)*

**The gap:** `decrypt_message()` is a stub. Encrypted emails show a button that goes nowhere.

### Architecture

| Layer | Change |
|-------|--------|
| **Rust** (`src-tauri/src/pgp/crypto.rs`) | Implement `decrypt_message(ciphertext_b64, private_key_armored, passphrase) → plaintext` using `sequoia-openpgp` |
| **Tauri commands** | Add `decrypt` command |
| **Service** (`src/services/pgp/pgpService.ts`) | Add `decryptMessage()` wrapper |
| **UI** (`src/components/email/`) | `EncryptedMessageBanner` — detect `-----BEGIN PGP MESSAGE-----`, show "Decrypt" button, render decrypted content in a sandboxed iframe (same sanitization as regular email) |
| **Security rule** | Decrypted plaintext is **never** written to SQLite. Kept in Zustand `composerStore` memory only, cleared on thread change |

### Key Detail

Add a `passphrase_cache` in Rust (not JS) — optionally cache the PGP passphrase in memory for the session with a timeout (e.g., 15 minutes), so the user isn't typing it for every encrypted email. Rust holds it, not SQLite.

---

## Phase 2: International Dynamic Compliance Assistant *(Week 2-3)*

**The gap:** No compliance checking. Your client operates in Morocco but may email EU clients (GDPR), US clients (CAN-SPAM), or Brazilian clients (LGPD). Hardcoding Moroccan rules is too narrow.

### Architecture: Dynamic Jurisdiction Engine

Build a **jurisdiction-aware rule engine** where compliance profiles are JSON rule sets stored in SQLite. The app detects the recipient's domain/country and applies the correct rules.

#### Database Schema (Migration v28)

```sql
compliance_profiles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,        -- 'ma', 'gdpr', 'can-spam', 'lgpd', 'custom'
  name TEXT NOT NULL,               -- 'Morocco Business', 'GDPR (EU)', etc.
  region_hint TEXT,                 -- domain TLDs or country codes: '.ma,.fr'
  rules_json TEXT NOT NULL,         -- JSON rule array
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
)

compliance_checks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  email_draft_id TEXT,              -- references local_drafts or campaigns
  profile_id TEXT,
  score INTEGER,                    -- 0-100
  violations_json TEXT,             -- array of failed rules
  checked_at INTEGER
)
```

#### Rule Engine (Local, No Cloud)

Rules are evaluated locally in `src/services/compliance/`:

```ts
interface ComplianceRule {
  id: string;
  type: 'signature_required' | 'unsubscribe_required' | 'disclaimer_required' 
       | 'tone_check' | 'data_minimization' | 'retention_notice'
       | 'custom_regex';
  severity: 'error' | 'warning' | 'info';
  messageKey: string;           // i18n key: "compliance.ma.rc_required"
  config?: {
    field?: string;             // for signature_required: "rc_number"
    regex?: string;             // for custom_regex
    minWords?: number;          // for tone_check
    domains?: string[];         // only apply if recipient domain matches
  };
}
```

**Built-in profiles shipped with the app:**

| Profile | Key Rules |
|---------|-----------|
| **Morocco Business** | Signature must contain RC/IF/ICE/CNSS; formal French/MSA tone; no excessive Darija in business context |
| **GDPR (EU)** | Unsubscribe link required for marketing; data retention notice; no pre-ticked consent; lawful basis mention |
| **CAN-SPAM (US)** | Physical address in signature; clear subject line; 10-day opt-out honor; no harvested emails |
| **LGPD (Brazil)** | Similar to GDPR but Portuguese-language requirements |
| **Generic Professional** | No all-caps subject; attachment mentioned in body; signature present |

#### Dynamic Detection

```ts
// In composer, before sending
detectJurisdiction(recipientEmails: string[]): ComplianceProfile[] {
  // Check recipient TLDs, cached contact country fields, or manual override
  // Return applicable profiles (can be multiple!)
}
```

#### AI Integration (Optional, Local-first)

Use the existing AI service with a **local prompt template**:

```
You are a compliance assistant. The following email is being sent under [PROFILE_NAME] rules.
Rules: [RULES_JSON]
Email: [BODY]
Check for violations and suggest fixes. Respond in [LOCALE].
```

If offline, the rule engine still works 100% via regex and local checks. AI just improves tone analysis.

#### UI

- **Composer panel:** `CompliancePanel` — real-time score (0-100), red/yellow/green badge, expandable violation list with one-click fixes ("Add missing RC number", "Insert unsubscribe link")
- **Settings:** `ComplianceProfileManager` — toggle profiles, edit custom rules, import/export rule JSON
- **Campaigns:** Auto-check all campaign emails before enqueueing. Block send if `score < 70` and profile has `block_on_error`.

---

## Phase 3: Advanced Template Library *(Week 3-4)*

**The gap:** Templates exist but are flat. No categories, no conditional blocks, no quick-insert from composer.

### Architecture

#### Database (Migration v29)

```sql
template_categories (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  name TEXT NOT NULL,
  icon TEXT,                        -- Lucide icon name
  sort_order INTEGER,
  is_system INTEGER DEFAULT 0       -- reserved: Sales, Support, Legal, Marketing, Internal
)

templates (
  -- existing table, add:
  category_id TEXT REFERENCES template_categories(id),
  is_favorite INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  last_used_at INTEGER,
  conditional_blocks_json TEXT      -- advanced: [{"if": "{{company}}", "then": "...", "else": "..."}]
)
```

#### Template Variables v2

Extend existing `templateVariables.ts`:

| Variable | Source |
|----------|--------|
| `{{email}}`, `{{first_name}}`, `{{company}}` | Existing |
| `{{my_name}}`, `{{my_title}}`, `{{my_phone}}` | From account signature settings |
| `{{date}}`, `{{date_long}}` | Localized via i18n |
| `{{day_of_week}}` | Dynamic at send time |
| `{{random_greeting}}` | Rotates: "Bonjour", "Salam", "Hello" based on locale |

**Conditional blocks:**
```
{{#if company}}
Cher partenaire {{company}},
{{else}}
Cher client,
{{/if}}
```

Evaluated at send time in `resolveCampaignVariables()`.

#### Quick-Insert System

- **Keyboard shortcut:** `Ctrl+Shift+T` in composer opens `TemplatePicker` — searchable, categorized, favorites at top
- **Slash command in TipTap:** Type `/template` triggers picker inline
- **Usage tracking:** Sort templates by `usage_count` + `last_used_at`
- **Template sharing:** Export category or single template to JSON file. Import via drag-and-drop. No cloud needed.

#### UI Components

| Component | Location |
|-----------|----------|
| `TemplatePicker` | `src/components/composer/TemplatePicker.tsx` — modal, fuzzy search, category tabs |
| `TemplateManager` | `src/components/settings/TemplateManager.tsx` — CRUD, categories, import/export |
| `TemplateVariablePreview` | Inline in composer — "Preview with: Ahmed, OCP SA" |

---

## Phase 4: Attachment Vault & Contact File Intelligence *(Week 4-5)*

**The gap:** Attachments are cached but scattered. No per-contact organization, no invoice detection, no local filing system.

### Architecture: Local File Vault

Velo already has `AttachmentLibrary` and `attachments` table. Extend it into a **Contact File Vault**.

#### Filesystem Structure (Rust-managed)

```
~/VeloVault/                          # or user-chosen path
├── {account_id}/
│   ├── contacts/
│   │   └── {contact_email_hash}/
│   │       ├── invoices/
│   │       ├── contracts/
│   │       ├── receipts/
│   │       └── general/
│   └── uncategorized/
└── .index.sqlite                     # optional: Velo already tracks in main DB
```

#### Database (Migration v30)

```sql
contact_files (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  message_id TEXT REFERENCES messages(id),
  original_filename TEXT,
  stored_path TEXT NOT NULL,        -- relative to vault root
  file_size INTEGER,
  mime_type TEXT,
  category TEXT DEFAULT 'general',  -- invoice|contract|receipt|general|image
  extracted_text TEXT,              -- OCR result (optional, local tesseract)
  is_starred INTEGER DEFAULT 0,
  saved_at INTEGER DEFAULT (unixepoch())
)
```

#### Auto-Categorization (Local)

When a user clicks "Save to Vault" (or auto-save rule):

1. **Filename heuristic:** `facture_*.pdf` → `invoice`, `contrat_*.pdf` → `contract`, `IMG_*` → `image`
2. **Content sniffing:** PDF text extraction in Rust (using `pdf-extract` or `lopdf`) — search for keywords: "facture", "invoice", "devis", "quote", "contrat", "contract"
3. **OCR (optional):** If PDF is scanned, run local Tesseract OCR to extract text for indexing
4. **Full-text index:** Add `contact_files` content to FTS5 for searchability

#### UI

- **Contact Sidebar tab:** "Files" — shows folders (Invoices, Contracts, Receipts, All) with file list, preview, download
- **Attachment hover:** "Save to Vault" button on any attachment in thread view
- **Attachment Library v2:** Global vault browser with filters (by contact, by category, by date, by file type)
- **Bulk actions:** Select multiple files → export ZIP, move category, delete

#### Compliance Link

The compliance assistant checks: *"You mentioned an attachment in the body. Is it saved to the vault for audit trail?"* — optional rule for industries that need document retention.

---

## Phase 5: Email Backup, Export & Archive *(Week 5-6)*

**The gap:** No way to export emails for legal hold, migration, or local backup.

### Architecture: Rust-Driven Export Engine

All heavy lifting in Rust (file I/O, compression, format conversion). React UI just triggers and shows progress.

#### Export Formats

| Format | Use Case | Rust Implementation |
|--------|----------|---------------------|
| **MBOX** | Migrate to Thunderbird/Outlook | Append RFC 2822 messages to Unix mbox file |
| **EML** | Single email export | Raw message save |
| **PDF** | Legal archive, human-readable | HTML → headless print or `printpdf` crate |
| **Encrypted ZIP** | Secure backup | Zip + AES-256 encryption via Rust |
| **JSON** | Structured data, analytics | Message metadata + body as JSON array |

#### Backup Scheduler (Rust Background Task)

Even when Velo is minimized, a Rust thread can run backups:

```rust
// src-tauri/src/backup/scheduler.rs
#[tauri::command]
pub fn schedule_backup(config: BackupConfig) -> Result<(), String>

// Runs as async tokio task, checks cron expression, executes backup
```

**Config stored in SQLite:**
```sql
backup_schedules (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  name TEXT,
  format TEXT,              -- mbox|zip|json
  filter_query TEXT,        -- smart folder query: "from:client.ma has:attachment"
  destination_path TEXT,    -- user chosen
  schedule_cron TEXT,       -- "0 2 * * 0" = weekly Sunday 2am
  encrypt INTEGER DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  is_active INTEGER DEFAULT 1
)
```

#### UI

- **Export Wizard:** `ExportDialog` — pick format, pick date range, pick filter (all mail / starred / from segment), destination folder, encrypt checkbox
- **Backup settings:** `BackupSchedulerSettings` — list schedules, enable/disable, manual run now
- **Progress indicator:** Rust emits events via Tauri `emit()` → React shows progress bar

---

## Phase 6: The "Velo Vault" Integration Layer *(Week 6 — Polish)*

Tie everything together into a cohesive **Local Business Intelligence** experience.

### Unified Search

Extend FTS5 to index:
- `messages` (existing)
- `contacts` (existing)
- `tasks` (existing)
- `contact_files` (new — including OCR text)

Search query: `"facture OCP 2024"` → finds emails, PDFs in vault, and tasks related to OCP.

### Dashboard View (Optional, Low Priority)

A new optional "Business" tab showing:
- Pending compliance checks
- Recent vault activity
- Upcoming scheduled campaigns
- Follow-up reminders needing action

### Offline-First Guarantees

Every feature above works without internet:
- PGP: local crypto
- Compliance: local rule engine
- Templates: local SQLite
- Vault: local filesystem
- Backup: local export

Only AI-enhanced compliance and cloud sync (Gmail) need connectivity.

---

## Final Roadmap Summary

| Phase | Feature | Week | Key Rust Work | Key React Work |
|-------|---------|------|---------------|----------------|
| 1 | PGP Decryption | 1 | `decrypt_message`, passphrase cache | `EncryptedMessageBanner` |
| 2 | Compliance Engine | 2-3 | — | `CompliancePanel`, `ComplianceProfileManager`, rule evaluator |
| 3 | Advanced Templates | 3-4 | — | `TemplatePicker`, slash commands, conditional blocks |
| 4 | Attachment Vault | 4-5 | PDF text extract, OCR, file ops | `ContactFileVault`, `AttachmentLibrary v2` |
| 5 | Backup & Export | 5-6 | MBOX writer, ZIP encrypt, scheduler | `ExportDialog`, `BackupSchedulerSettings` |
| 6 | Integration & Polish | 6 | FTS5 extension for files | Unified search, optional dashboard |
