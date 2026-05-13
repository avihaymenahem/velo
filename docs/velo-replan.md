# Velo Development Status & Roadmap v0.5.0

> **Status:** QA Complete — all 13 identified issues (P0–P3) resolved.
> **Version:** 0.5.0 (fork based on upstream 0.4.22 + 40+ migrations)
> **Architecture:** Tauri v2 + React 19 + Rust + SQLite (offline-first)

---

## Current State

| Metric | Value |
|--------|-------|
| DB migrations | v1–v40 (40 total) |
| Test files | 142+ TypeScript, 7 Rust |
| Tests passing | 1659/1660 (1 pre-existing search sort flake) |
| TypeScript | Strict mode, 0 errors |
| Architecture | Tauri v2 + React 19 + Rust + SQLite |

### Feature Highlights

| Feature | Status | Docs |
|---------|--------|------|
| PGP Encryption (generate, encrypt, decrypt) | ✅ Live | `pgp-encryption.md` |
| Compliance Engine (GDPR, CAN-SPAM, LGPD, etc.) | ✅ Live | `compliance-engine.md` |
| Advanced Templates (categories, variables, conditional blocks) | ✅ Live | `advanced-templates.md` |
| Attachment Vault (categorize, search, FTS5) | ✅ Live | `attachment-vault.md` |
| Backup & Export (MBOX, EML, scheduled) | ✅ Live | — |
| Advanced Filters (conditions, AND/OR, regex) | ✅ Live | `advanced-filters.md` |
| Quick Replies (canned responses) | ✅ Live | `quick-replies.md` |
| Workflow Engine (triggers, actions, scheduler) | ✅ Live | `workflow-engine.md` |
| Campaigns & Mail Merge (wizard, tracking, analytics) | ✅ Live | `campaigns-mail-merge.md` |
| Contact Intelligence (tags, groups, segments, CSV import) | ✅ Live | `contact-intelligence.md` |
| i18n (en, fr, ar, ja, it — RTL support) | ✅ Live | `i18n-localization.md` |
| Keyboard Shortcuts (customizable, two-key sequences) | ✅ Live | `keyboard-shortcuts.md` |
| AI (Claude, OpenAI, Gemini, custom provider) | ✅ Live | — |
| SMTP Connection Pooling | ✅ Live | — |
| DNS Checker (SPF/DKIM/DMARC) | ✅ Live | — |
| Pre-send Checklist (spam score, links, images) | ✅ Live | — |

### QA Issues Resolved (v0.4.22 → v0.5.0)

| Issue | Fix | File(s) |
|-------|-----|---------|
| P0-1 Migration failures (idx already exists) | Idempotent per-statement error handling | `migrations.ts` |
| P0-2 i18n init race condition | Promise guard + `useI18nReady()` hook | `i18n.ts`, `App.tsx` |
| P0-3 Rust Tokio runtime panic | `tauri::async_runtime::spawn` | `lib.rs`, `scheduler.rs` |
| P1-1 IMAP/SMTP connection timeouts | Frontend timeout wrapper + TLS port mapping | `AddImapAccount.tsx`, `smtp/client.rs` |
| P1-2 Account setup stuck states | `useReducer` state machine + `AbortController` | `AddAccount.tsx` |
| P1-3 Workflow preset save silent fail | Inline error feedback | `WorkflowEditor.tsx` |
| P2-1 Missing translation keys | Full i18n audit on account components | `AddImapAccount.tsx`, `AddCalDavAccount.tsx` |
| P2-2 Empty states without actions | `NoAccountsEmptyState` with Add button | `SettingsPage.tsx` |
| P2-3 Queue pause/resume lost on refresh | Persist state to SQLite settings | `QueueInspector.tsx`, `settings.ts` |
| P3-1 PGP tab not understandable | Guided onboarding flow | `PgpKeyManager.tsx` |
| P3-2 Compliance tab no education | Help section with profile docs + import format | `ComplianceProfileManager.tsx` |
| P3-3 No template presets | 5 built-in presets seeded (migration v39) | `migrations.ts` |
| P3-4 No composer presets | Formatting profiles per account (migration v40) | `migrations.ts` |

---

## Upstream Integration Status

| Category | PRs/Issues | Status |
|----------|-----------|--------|
| **Critical bug fixes** | #206, #219, #230, #201, #203, #190 | ✅ Merged |
| **Security hardening** | #245, #255, #252, #241, #240 (crypto, SQL, unsubscribe, SSRF) | ✅ Merged |
| **IMAP reliability** | #262 (shared folders, UIDVALIDITY, connection handling) | ✅ Merged |
| **AI provider** | #242, #261, #259 (custom provider, Ollama, language setting) | ✅ Merged |
| **i18n** | #249, #202 (Japanese, Italian) | ✅ Merged |
| **Password special chars** | [#256](https://github.com/Zakarialabib/velo/issues/256) | ✅ Fixed |
| **SMTP credentials** | [#252/#253/#255](https://github.com/Zakarialabib/velo/issues/252) | ✅ Fixed |
| **SQLite BUSY errors** | [#240](https://github.com/Zakarialabib/velo/issues/240) | ✅ Fixed |
| **Shared folders** | [#241](https://github.com/Zakarialabib/velo/issues/241) | ✅ Fixed |
| **Dependabot bumps** | dompurify, openssl, rustls-webpki, vite, picomatch, flatted, tar, undici, quinn-proto | ✅ Merged |

---

## Remaining Gaps & Future Roadmap

### Short-term (v0.5.x)

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 1 | Flatpak build fix (#233) — correct CI manifest, verify >50MB artifact | Medium | 2h |
| 2 | Linux performance profiling (#232) — React re-renders, IPC polling | High | 4h |
| 3 | install.cat installer scripts (PR #231) | Low | 1h |
| 4 | AI agent panel (PR #185) — sandboxed tool-use with user confirmation | High | 1–2 weeks |
| 5 | Integration test suite — 10+ tests covering core flows | Medium | 1 week |

### Medium-term (v0.6–v0.8)

| # | Item | Phase |
|---|------|-------|
| 6 | Sidebar unread count badges (#243) | UI Polish |
| 7 | Split inbox refinement — editable AI categorization | UI Polish |
| 8 | Thread rendering optimization — virtual scrolling, lazy attachments | Performance |
| 9 | Filter engine v2 — regex, scoring, chaining, monitoring | Automation |
| 10 | Contact intelligence v2 — engagement scoring, dynamic segments | CRM |
| 11 | Campaign A/B testing — send 2 variants, auto-pick winner | Campaigns |
| 12 | Analytics dashboard export — CSV/PDF | Campaigns |
| 13 | Email warming system — gradual volume increase | Deliverability |
| 14 | Blacklist checker — Spamhaus, Barracuda | Deliverability |
| 15 | Bounce classification — hard vs soft, auto-suppress | Deliverability |
| 16 | ARF feedback loop processing — parse ISP bounce reports | Deliverability |

### Long-term (Post-1.0)

- New email providers (Exchange/Graph API, JMAP)
- Mobile companion app via shared Rust core
- CalDAV/CardDAV sync
- WASM plugin architecture for custom rules
- End-to-end encrypted multi-device sync

### Out of Scope (not planned)

- Social/collaboration features
- Major UI framework migration
- Rewrite of Rust backend

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Critical IMAP/SMTP bugs | 0 open | 0 |
| App launch time | — | < 2s cold start |
| IMAP sync reliability | — | < 0.1% failures |
| Test coverage (service layer) | — | > 80% |
| Linux UI responsiveness | — | < 200ms |
| Campaign throughput | — | > 100/min |
