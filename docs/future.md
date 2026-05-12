# Velo Development Status & Roadmap

> Offline-first, local-first. SQLite + Rust + React 19. All features work without internet unless noted.

---

## Current snapshot

Version `0.4.22` reflects the current fork state and the features included in this release.

### Feature highlights

| Phase | Feature | Why | Where |
|------|---------|-----|-------|
| P1 | PGP Decryption | Enable secure email decryption and privacy protection for encrypted messages. | `src-tauri/src/pgp/{crypto,cache,keyring}.rs`, `EncryptedMessageBanner.tsx`, `pgpService.ts` |
| P2 | Compliance Engine | Provide jurisdiction-aware compliance checks for outgoing email drafts. | `src/services/compliance/{types,ruleEngine,aiEnhancer}.ts`, `CompliancePanel.tsx`, `ComplianceProfileManager.tsx` |
| P3 | Advanced Templates | Organize templates with categories, variables, conditional blocks, and slash commands. | `TemplatePicker.tsx`, `TemplateSlashExtension.ts`, `TemplateManager.tsx`, `templateVariables.ts`, `templateCategories` |
| P4 | Attachment Vault | Create a local vault for attachment storage, categorization, and search. | `src-tauri/src/vault/{ops,pdf}.rs`, `contactFiles.ts`, `vaultService.ts`, `vaultCategorizer.ts` |
| P5 | Backup & Export | Add local export and scheduled backup capabilities for mailbox data. | `src-tauri/src/export/{types,mbox,scheduler}.rs`, `exportService.ts`, `ExportDialog.tsx`, `BackupSchedulerSettings.tsx` |
| P6 | Vault Integration | Expose vault files in search and contact context. | `search.ts`, `BusinessDashboard.tsx`, `/business` route, sidebar nav |
| P7 | Fixes, polish, and test coverage | Complete polish work across contact sidebar, composer templates, and quick reply integration. | `ContactSidebar.tsx`, `Composer.tsx`, `InlineReply.tsx` |
| P8 | Advanced Filter Engine | Add multi-condition filter rules with AND/OR support and richer actions. | `FilterEditor.tsx`, `FilterTestDialog.tsx`, `filter_conditions` table |
| P9 | Filter Engine UI | Provide a composable UI for building advanced filter conditions. | `FilterTestDialog.tsx`, `FilterEditor.tsx` |
| P10 | Quick Reply Templates | Offer reusable canned replies in both inline and full composer flows. | `QuickReplyList.tsx`, `QuickReplyEditor.tsx`, `quickReplies.ts`, `EditorToolbar.tsx` |
| S1 | Stabilization Sprint | Integrate critical upstream fixes and improve reliability, security, and compatibility. | `migrations.ts`, `icalHelper.ts`, `EmailRenderer.tsx`, `useKeyboardShortcuts.ts`, `src/services/ai/providers/customProvider.ts`, `src-tauri/src/lib.rs` |

---

## Feature context

Each feature area is documented in the `docs/` folder and is implemented as a combination of UI components, service-layer logic, SQLite schema updates, and Rust backend integration where required. The current roadmap centers on:

- preserving local-first behavior,
- reusing existing service abstractions,
- keeping background sync and offline queue behavior consistent, and
- avoiding broad rewrites in favor of incremental improvements.

---

## Stabilization and upstream integration

The fork has merged a set of upstream reliability and security fixes while retaining the feature work in the fork. Key integration areas include:

- migration repair and database stability,
- iCal UTC handling,
- iframe remote link behavior,
- CSP and Tauri capability updates,
- IMAP connection reliability and shared-folder handling,
- separate SMTP credentials support, and
- custom OpenAI-compatible AI provider support.

---

## Known gaps and risk areas

1. **Git SSL certificate errors** during remote pushes: fix Git SSL configuration or switch to SSH.
2. **Rust build issues on Windows** due to MinGW/dlltool; a proper MSVC toolchain is required for production builds.
3. **Gmail API sync remains online-only**; offline behavior is preserved for non-Gmail providers.
4. **AI-enhanced compliance is optional** and should gracefully fall back when no provider is configured.

---

## Roadmap

### Short-term focus

- stabilize the current fork release,
- resolve build and push environment issues,
- wire email snooze presets and recurring snooze options,
- complete documentation cleanup for feature and stabilization guides.

### Medium-term focus

- add JMAP provider support,
- expand local AI options with Ollama / LM Studio,
- build campaign A/B testing and analytics dashboards,
- improve thread attachment browsing with a grid view.

### Long-term vision

- introduce CalDAV and CardDAV sync,
- support a mobile companion app via shared Rust core,
- explore a WASM plugin architecture for custom rules,
- investigate end-to-end encrypted multi-device sync.

---

## Migration summary

| Migration | Scope | Notes |
|----------|-------|-------|
| 28 | Compliance profiles and checks | Adds compliance rules and profile storage |
| 29 | Template categories and enhancements | Adds template categories and metadata |
| 30 | Contact file vault | Adds vault file storage and metadata tables |
| 31 | Backup schedules and contact files | Adds backup scheduling and contact file records |
| 32 | FTS5 file search | Adds full-text search for contact files |
| 33 | Advanced filter engine | Adds `filter_conditions` and `group_operator` support |
| 34 | Quick replies | Adds `quick_replies` table and indexes |
| 35 | SMTP credentials separation | Adds separate SMTP credential fields to accounts |

---

## Testing strategy

The codebase uses Vitest with colocated tests and `@testing-library/jest-dom/vitest`. Current coverage includes 142 test files across TypeScript and Rust. New additions should continue the pattern of local `*.test.ts` coverage in the same directories as the implemented code.

---

## Offline-first guarantee

The application remains offline-first for all local features and IMAP workflows. Only Gmail API sync and optional AI services require network access.
