# Attachment Vault & Contact File Intelligence

## 1. Overview

The Attachment Vault provides a local filesystem-based repository for organizing email attachments per contact. It combines automatic categorization by filename patterns, PDF text extraction, FTS5 full-text search, and a UI presence in both the Contact Sidebar (Files tab) and Attachment List (Save to Vault button).

Vault paths are scoped under `$APPDATA/velo/vault/`. The intended layout uses `{account_id}/{contact_hash}/{category}/{filename}`, though initial implementation uses a simpler flat scheme (see Filesystem Structure below).

## 2. Filesystem Structure

```
$APPDATA/velo/vault/
  {account_id}/
    {contact_hash}/
      invoices/        → regex-matched filenames containing "invoice"
      contracts/       → regex-matched filenames containing "contract" / "agreement"
      receipts/        → regex-matched filenames containing "receipt"
      documents/       → pdf, docx, xlsx, pptx, txt, etc.
      images/          → jpg, png, gif, svg, webp, bmp, ico, heic
      videos/          → mp4, mov, avi, mkv, webm, wmv
      audio/           → mp3, wav, flac, aac, ogg, wma, m4a
      archives/        → zip, tar, gz, rar, 7z, iso, dmg
      executables/     → exe, msi, sh, bat, app, dll, so
      certificates/    → cert, pem, crt, key, pfx, p12, p7b
      calendar/        → ics
      contacts/        → vcf
      signatures/      → sig, pgp, gpg
      uncategorized/   → fallback
```

**Current implementation note:** The `vaultService.ts` saves files as `{vaultRoot}/{senderEmail_sanitized}/{timestamp}_{filename}` without category subdirectories in the filesystem path. Category is stored in the DB `category` column. The Contact Sidebar UI groups by category from the DB, not from filesystem folders.

## 3. Rust Backend

Four Tauri commands in `src-tauri/src/vault/`:

### `get_vault_root` (`ops.rs:5`)
Returns `<app_data_dir>/vault`, creating the directory if absent.

### `copy_to_vault` (`ops.rs:18`)
Copies a file from `source_path` to `vault_path`, creating parent directories. Used in the two-command flow (write via JS `writeFile`, then optionally copy via Rust). With Tauri v2 `plugin-fs`, the primary write path is JS-side `writeFile`; `copy_to_vault` is available for server-side or migration flows.

### `delete_from_vault` (`ops.rs:28`)
`std::fs::remove_file` on the vault path. Called from `deleteContactFile()` in `contactFiles.ts` when a contact file DB record is deleted.

### `list_vault_dir` (`ops.rs:33`)
Reads a directory and returns a `Vec<String>` of full paths. Available for vault browsing.

### `extract_pdf_text` (`pdf.rs:2`)
Uses `lopdf` to load a PDF, iterate all pages, and concatenate extracted text. Returns `Result<String, String>`.

Module registration in `mod.rs`:
```rust
pub mod ops;
pub mod pdf;
```

## 4. Auto-Categorization

Two-stage system in `vaultCategorizer.ts`:

### Stage 1 — Extension-based (`categorizeByFilename`)
Maps file extension to a broad category tier. 61 rules covering 11 tiers:

| Tier | Extensions |
|------|-----------|
| `documents` | pdf, docx?, xlsx?, pptx?, txt, rtf, csv, md, json, xml, html? |
| `images` | jpg, jpeg, png, gif, svg, webp, bmp, ico, heic |
| `videos` | mp4, mov, avi, mkv, webm, wmv |
| `audio` | mp3, wav, flac, aac, ogg, wma, m4a |
| `archives` | zip, tar, gz, rar, 7z, iso, dmg |
| `executables` | exe, msi, sh, bat, app, dll, so |
| `certificates` | cert, pem, crt, key, pfx, p12, p7b |
| `calendar` | ics |
| `contacts` | vcf |
| `signatures` | sig, pgp, gpg |
| `uncategorized` | (fallback) |

### Stage 2 — Keyword-based (`extractKeywordsForCategory`)
Applies 60 regex patterns on the basename for semantic labels:

| Label | Triggers |
|-------|----------|
| `invoice` | /invoice/i |
| `receipt` | /receipt/i |
| `contract` | /contract\|agreement/i |
| `resume` | /resume\|cv\|curriculum/i |
| `tax` | /tax\|w2\|1099/i |
| `paystub` | /paystub\|pay.?slip/i |
| `nda` | /nda/i |
| `financial` | /financial\|bank/i |
| *(40+ more labels)* | |

Returns an array of matched keyword labels (deduplicated).

## 5. Vault Service Flow

`saveAttachmentToVault()` in `vaultService.ts`:

1. **Download** — Calls `getEmailProvider(accountId).fetchAttachment(messageId, gmail_attachment_id)` to get base64 data
2. **Decode** — Base64 → `Uint8Array`
3. **Get vault root** — `invoke("get_vault_root")`
4. **Hash contact** — Sanitizes sender email: `senderEmail.replace(/[@.]/g, "_")` → contact directory name
5. **Generate filename** — `{Date.now()}_{original_filename}`
6. **Write** — Uses Tauri `plugin-fs` (`mkdir` + `writeFile`) to write bytes to `{vaultRoot}/{contactDir}/{storedFilename}`
7. **Lookup contact** — `getContactByEmail(senderEmail)` for optional `contact_id`
8. **Categorize** — `categorizeByFilename(attachment.filename)`
9. **DB insert** — `saveContactFile()` with all metadata
10. **Return** vault path string

## 6. DB Schema

### `contact_files` (migration v31)

```sql
CREATE TABLE IF NOT EXISTS contact_files (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id    TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT,
  size          INTEGER,
  category      TEXT DEFAULT 'general',
  starred       INTEGER DEFAULT 0,
  sender_email  TEXT,
  message_id    TEXT,
  local_path    TEXT,
  created_at    INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_contact_files_account  ON contact_files(account_id);
CREATE INDEX IF NOT EXISTS idx_contact_files_contact  ON contact_files(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_files_category ON contact_files(account_id, category);
```

### `contact_files_fts` (migration v32)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS contact_files_fts USING fts5(
  filename,
  original_name,
  content='contact_files',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS contact_files_ai AFTER INSERT ON contact_files BEGIN
  INSERT INTO contact_files_fts(rowid, filename, original_name)
  VALUES (new.rowid, new.filename, new.original_name);
END;

CREATE TRIGGER IF NOT EXISTS contact_files_ad AFTER DELETE ON contact_files BEGIN
  INSERT INTO contact_files_fts(contact_files_fts, rowid, filename, original_name)
  VALUES ('delete', old.rowid, old.filename, old.original_name);
END;

CREATE TRIGGER IF NOT EXISTS contact_files_au AFTER UPDATE ON contact_files BEGIN
  INSERT INTO contact_files_fts(contact_files_fts, rowid, filename, original_name)
  VALUES ('delete', old.rowid, old.filename, old.original_name);
  INSERT INTO contact_files_fts(rowid, filename, original_name)
  VALUES (new.rowid, new.filename, new.original_name);
END;
```

Uses trigram tokenizer (same as `messages_fts`), with auto-sync triggers on insert/update/delete.

## 7. DB Service (`contactFiles.ts`)

Nine query functions:

| Function | Purpose |
|----------|---------|
| `saveContactFile(file)` | INSERT a new contact file record |
| `getContactFilesByContact(contactId)` | Files for a specific contact |
| `getContactFilesBySender(senderEmail)` | Files by sender email |
| `getContactFilesByAccount(accountId)` | All files for an account |
| `searchContactFiles(query)` | LIKE-based fallback search on `original_name` / `filename` |
| `getContactFilesByCategory(accountId, category)` | Filter by category |
| `getContactFileCategories(accountId)` | Distinct categories for an account |
| `updateFileCategory(id, category)` | Re-categorize a file |
| `toggleFileStarred(id)` | Toggle starred flag |
| `deleteContactFile(id)` | Delete DB record + invoke `delete_from_vault` to remove from disk |

## 8. Search Integration

Vault files are included in the unified search (`search.ts:152-193`). The search query is run against `contact_files_fts` via `fts MATCH`, joined back to `contact_files`. Results are typed as `type: 'file'` with metadata JSON (`category`, `size`, `mime_type`, `starred`). For account-scoped searches the query filters by `account_id`; global searches omit the filter.

## 9. Contact Sidebar — Files Tab

The `VaultFilesSection` component (`ContactSidebar.tsx:543-613`) is rendered as the fourth sidebar tab (icon: `FolderOpen`). It:

- Groups files into four UI category folders: **Invoices**, **Contracts**, **Receipts**, **General**
- Maps DB categories to UI folders (case-insensitive match via `f.category === catLower || f.category === cat`)
- Shows a count badge per folder, clickable to expand/collapse
- Each file row shows `original_name` and formatted file size
- Renders empty-state text when no vault files exist (`t('contact.noVaultFiles')`)

Files are loaded on contact select via `getContactFilesBySender(email)`.

## 10. Attachment List — Save to Vault Button

`AttachmentList.tsx:174-219` — each attachment preview header includes a **Save to Vault** button (`Archive` icon):

- Visible only when `fromAddress` is available
- Three states: `"Save to Vault"` (idle, accent border styling), `"Saving..."` (disabled), `"Saved!"` (green, 2s timeout then reset)
- Calls `saveAttachmentToVault(accountId, messageId, fromAddress, attachment)`

## 11. File Map

| File | Purpose |
|------|---------|
| `src-tauri/src/vault/mod.rs` | Module re-exports for `ops` and `pdf` |
| `src-tauri/src/vault/ops.rs` | Rust commands: get_vault_root, copy_to_vault, delete_from_vault, list_vault_dir |
| `src-tauri/src/vault/pdf.rs` | Rust command: extract_pdf_text (lopdf) |
| `src-tauri/src/vault/Cargo.toml` | (via parent) depends on `lopdf` |
| `src/services/attachments/vaultCategorizer.ts` | Two-stage categorization: extension-based (11 tiers) + keyword-based (60+ semantic labels) |
| `src/services/attachments/vaultService.ts` | `saveAttachmentToVault()` — download, decode, write, categorize, DB persist |
| `src/services/db/contactFiles.ts` | `ContactFile` interface + 9 CRUD query functions |
| `src/services/db/contactFiles.test.ts` | Tests for contact files DB operations |
| `src/services/db/migrations.ts` | Migration v31 (contact_files + backup_schedules tables), v32 (contact_files_fts FTS5 virtual table) |
| `src/services/db/search.ts` | Unified search — FTS5 vault file search (type: 'file') |
| `src/components/email/ContactSidebar.tsx` | Tab nav with Files tab, `VaultFilesSection` component with category folders |
| `src/components/email/AttachmentList.tsx` | "Save to Vault" button in attachment preview header |
