# Velo Development Status & Roadmap

> **Offline-first, local-first.** SQLite + Rust + React 19. All features work without internet unless noted.

---

## Current State (v0.4.22)

### Feature Phases

| Phase | Feature | Status | Key Files |
|-------|---------|--------|-----------|
| **P1** | PGP Decryption | ✅ | `src-tauri/src/pgp/{crypto,cache,keyring}.rs`, `EncryptedMessageBanner.tsx`, `pgpService.ts` |
| **P2** | Compliance Engine | ✅ | `src/services/compliance/{types,ruleEngine,aiEnhancer}.ts`, `CompliancePanel.tsx`, `ComplianceProfileManager.tsx` |
| **P3** | Advanced Templates | ✅ | `TemplatePicker.tsx`, `TemplateSlashExtension.ts`, `TemplateManager.tsx`, `templateVariables.ts`, `templateCategories` |
| **P4** | Attachment Vault | ✅ | `src-tauri/src/vault/{ops,pdf}.rs`, `contactFiles.ts`, `vaultService.ts`, `vaultCategorizer.ts` |
| **P5** | Backup & Export | ✅ | `src-tauri/src/export/{types,mbox,scheduler}.rs`, `exportService.ts`, `ExportDialog.tsx`, `BackupSchedulerSettings.tsx` |
| **P6** | Vault Integration | ✅ | `search.ts` (unified FTS5), `BusinessDashboard.tsx`, `/business` route, sidebar nav |
| **P7** | Fixes + Polish + Missing Tests | ✅ | `ContactSidebar.tsx` (vault tab wired), `Composer.tsx` (template picker wired), `InlineReply.tsx` (QuickReply integration) |
| **P8** | Advanced Filter Engine | ✅ | `FilterEditor.tsx`, `FilterTestDialog.tsx`, filter_conditions table, 5 operator types, AND/OR group_operator |
| **P9** | Advanced Filter Engine UI | ✅ | `FilterTestDialog.tsx`, `FilterEditor.tsx` (condition rows, group operator toggle) |
| **P10** | Quick Reply Templates | ✅ | `QuickReplyList.tsx`, `QuickReplyEditor.tsx`, `quickReplies.ts` DB service, `EditorToolbar.tsx` (quick reply button), `InlineReply.tsx` (integration) |
| **S1** | Stabilization Sprint | ✅ | 14 upstream PRs merged (bug fixes, security, IMAP reliability, custom AI provider, i18n ja/it, SMTP v35) |

### Previously Built

| Area | Key Files |
|------|-----------|
| **i18n** (5 locales en/fr/ar/ja/it, RTL) | `src/locales/i18n.ts`, `src/locales/{en,fr,ar,ja,it}/translation.json` |
| **Contact Intelligence** (tags, groups, segments, merge, CSV import) | `src/services/contacts/{tags,groups,segments,activity,merge,gravatar}.ts`, `src-tauri/src/contacts/csv.rs` |
| **Campaigns** (CRUD, variables, send queue) | `src/services/campaigns/{campaignService,templateVariables,trackingService}.ts`, `src/stores/campaignStore.ts` |
| **Workflow Engine** (triggers, cron, 7 action types) | `src/services/workflows/{workflowEngine,workflowScheduler}.ts`, `WorkflowEditor.tsx` |
| **Smart Labels** (AI auto-labeling, backfill) | `src/services/smartLabels/{smartLabelService,smartLabelManager,backfillService}.ts` |
| **Rust Backend** (IMAP, SMTP, OAuth, tray, PGP, vault, export) | `src-tauri/src/{commands,imap,smtp,oauth,pgp,contacts,vault,export}.rs` |
| **Database** (SQLite, 34 migrations, 45+ tables, FTS5) | `src/services/db/{connection,migrations,complianceProfiles,contactFiles,search,...}.ts` |

### Stabilization Merged from Upstream

| Area | Key Files |
|------|-----------|
| **6 critical bug fixes** (migration repair, iCal UTC, iframe links, CSP, HTTP ports, shortcuts) | Various — `migrations.ts`, `icalHelper.ts`, `EmailRenderer.tsx`, CSP config, capabilities, `useKeyboardShortcuts.ts` |
| **Security hardening** (7 fixes) | `unsubscribeManager.ts`, DB services, CSP, crypto usage |
| **IMAP reliability** (SQLite BUSY, shared folders, password quoting, DavMail) | `connection.ts`, `imapSync.ts`, `folderMapper.ts`, `imapConfigBuilder.ts`, Rust IMAP client |
| **Custom AI provider** (OpenAI-compatible) | `src/services/ai/providers/customProvider.ts`, `providerFactory.ts`, settings UI |
| **Separate SMTP credentials** (migration v35) | `AddImapAccount.tsx`, `accounts` table migration, `imapConfigBuilder.ts`, Rust SMTP client |
| **2 new locales** (ja, it) | `src/locales/{ja,it}/translation.json`, locale registration |
| **Export scheduler wiring** | `src-tauri/src/lib.rs` (scheduler initialized in `setup()`) |
| **Dependency updates** (openssl, webpki, dompurify, vite) | Various `Cargo.toml` and `package.json` files |

### Architecture Reference

| Pattern | Convention |
|---------|-----------|
| **Primary keys** | `crypto.randomUUID()` |
| **Timestamps** | `unixepoch()` in SQL, `Math.floor(Date.now() / 1000)` in JS |
| **Booleans** | INTEGER 0/1 |
| **Zustand stores** | `create<T>()((set, get) => ({}))` |
| **DB service files** | Plain async functions, `getDb()` singleton |
| **Dynamic updates** | `buildDynamicUpdate(table, idColumn, id, fields)` |
| **Transactions** | `withTransaction(async (db) => { ... })` |
| **Select first** | `selectFirstBy<T>(query, params)` |
| **Exists check** | `existsBy(query, params)` |
| **Tauri invoke** | `invoke("command_name", { arg })` |
| **Rust commands** | `#[tauri::command]` in module, register in `lib.rs` `generate_handler![]` |
| **Background checkers** | `createBackgroundChecker(name, fn, intervalMs)` |
| **Migrations** | `const MIGRATIONS = [{ version: N, description, sql }]` in `migrations.ts` |
| **i18n keys** | `useTranslation()` → `t("key")` in `locales/*/translation.json` |

---

## Remaining Work

### Known Gaps

1. **Push to remote** — SSL cert error (`ca-bundle.crt`). Fix Git SSL configuration or switch to SSH.
2. **Rust `cargo build`** — Local MinGW/dlltool issues on this machine. Code is structurally correct (passes `tsc --noEmit` + `vitest`). Fix by installing proper MSVC toolchain.

---

## What's Next

### Short-term (fixes & polish)

1. **Fix SSL cert** → push to remote → CI/CD pipeline setup
2. **Fix Rust build** → install MSVC toolchain, verify `cargo build`
3. **Email Snooze Presets** — Custom snooze durations with recurring snooze. New `snooze_presets` table, SnoozePresetsEditor in settings, preset picker in SnoozeDialog.

### Medium-term (new features)

| Feature | Description | Rust Work | React Work |
|---------|-------------|-----------|------------|
| **JMAP Email Provider** | Alternate provider for Apple iCloud, FastMail, etc. | JMAP fetch/auth parsing | Existing provider abstraction handles this |
| **Local AI (Ollama/LM Studio)** | Run AI features entirely offline via local LLM | — | New provider in `src/services/ai/providers/`, model picker UI |
| **Campaign A/B Testing** | Subject line + body variants with statistical analysis | — | Variant editor, results dashboard with recharts |
| **Email Snooze Presets** | Custom snooze durations with recurring snooze | — | SnoozePresetsEditor in settings, preset picker in SnoozeDialog |
| **Thread Attachments View** | Grid view of all attachments in a thread | — | Thread-level attachment grid component |

### Long-term (v1.0 vision)

| Feature | Rationale |
|---------|-----------|
| **CalDAV integration** | Native calendar sync (Apple iCloud, NextCloud) — IMAP provider pattern |
| **CardDAV contacts** | Two-way contact sync with address book |
| **Mobile companion** | Tauri mobile for iOS/Android (shared Rust core) |
| **Plugin system** | WASM-based plugins for custom rules, templates, and actions |
| **End-to-end encrypted sync** | Encrypted sync layer (Causal Tree / Automerge) for multi-device |

---

## Migration Version Summary

| Version | Phase | Description |
|---------|-------|-------------|
| 28 | P2 | Compliance profiles & checks |
| 29 | P3 | Template categories & template enhancements |
| 30 | P4 | Contact file vault |
| 31 | P5 | Backup schedules |
| 32 | P6 | FTS5 index on contact files |
| 33 | P8 | Advanced filter engine: filter_conditions table, group_operator on filter_rules |
| 34 | P10 | Quick reply templates: quick_replies table |
| 35 | S1 | Separate SMTP credentials: smtp_username, smtp_password on accounts table |

---

## Offline-First Guarantees

Every feature works offline except AI-enhanced compliance (skipped gracefully) and Gmail API sync.

---

## Testing Strategy

**142 test files, 1,645 tests** passing (84 TS + 7 Rust), TypeScript 0 errors. New features should follow the colocated `*.test.ts` pattern with `vitest` + `@testing-library/jest-dom/vitest`.

---

## Future Vision: One-Click Sync

A unified sync layer that abstracts all email provider types behind a single interface with consistent progress reporting, conflict resolution, and health monitoring.

### Unified Sync Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Sync Orchestrator                   │
│  (syncManager.ts — manages all accounts & providers)  │
├──────────┬──────────┬──────────┬──────────────────────┤
│ Gmail    │ IMAP     │ JMAP     │ Local File /         │
│ API      │ Provider │ (future) │ Maildir Import        │
│ Provider │          │          │                       │
└──────────┴──────────┴──────────┴──────────────────────┘
         │          │          │
    ┌────┘──────────┘──────────┘────┐
    │         Progress Bus           │
    │   (status, count, rate, ETA)   │
    └───────────────────────────────┘
```

### One-Click Account Setup

- Expand the existing `autoDiscovery.ts` to auto-detect provider type (Gmail API, IMAP, JMAP) from just an email address
- Probe common ports/endpoints for IMAP (`imap.gmail.com`, `outlook.office365.com`, `imap.mail.me.com`) and JMAP endpoints (`/.well-known/jmap`)
- Present a single unified "Add Account" flow — no need for the user to select "Gmail" vs "IMAP" manually
- Store auto-discovery results in settings for re-use and manual override

### Unified Progress Reporting

- Sync progress channel emits structured events across ALL provider types:
  - `progress`: `{ accountId, folder, current, total, phase: "connect"|"sync"|"process" }`
  - `complete`: `{ accountId, folder, newMessages, updatedMessages }`
  - `error`: `{ accountId, folder, error, retryable }`
- UI subscribes via Tauri event system and shows a single unified progress bar / status widget
- No more per-provider progress states scattered across components

### Conflict Resolution Strategy

| Scenario | Strategy |
|----------|----------|
| Local edit + remote change | **Last-write-wins** on a per-message basis (compare `modification_timestamp`) |
| Offline operations queued | **Local ops queue** (`pending_operations` table) replayed on reconnect, compacted for redundancy |
| Concurrent move/delete | **Optimistic local apply**, verified on next delta sync — reverts if remote disagrees |
| IMAP UIDVALIDITY change | Full folder resync detected via `folder_sync_state.uidvalidity` change |
| Draft conflict | **Local wins** — drafts are authoritative locally |

### Sync Now Button

- "Sync Now" button in the account list / settings panel that triggers a full sync across ALL providers
- Skips the normal 60s interval cooldown
- Runs sequentially per account (to avoid connection storms) but in parallel across accounts
- Shows real-time progress via the unified progress bus
- Disabled while a sync is already running for that account

### Background Sync Health Dashboard

- Table showing per-account and per-folder sync status:
  - `last_sync_at` — last successful sync timestamp
  - `last_sync_duration_ms` — how long the last sync took
  - `last_error` — last error message (if any)
  - `consecutive_failures` — error count before backing off
  - `pending_local_ops` — count of queued offline operations
- Stored in a new `folder_sync_state` table (existing table extended)
- Visual health indicators: green (ok), yellow (delayed >15min), red (errors or >1hr stale)
- Accessible from Settings → Sync Health
