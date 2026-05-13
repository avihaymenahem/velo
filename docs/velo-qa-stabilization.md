# Velo QA & Stabilization Specification

**Date:** 2026-05-12 → 2026-05-13 (resolved)
**Status:** ✅ RESOLVED (v0.5.0)
**Version:** 0.5.0

---

## Resolution Summary

All 13 identified issues (P0–P3) from QA testing of v0.4.22 have been fixed and merged to `main`. See `velo-replan.md` for the current roadmap and remaining gaps.

### P0 Critical — 3/3 Resolved
| Issue | Fix Commit | Resolution |
|-------|-----------|------------|
| Database migration failures | `main~10` | Idempotent per-statement error handling in `runMigrations()` |
| i18n initialization race | `main~9` | Promise guard + `useI18nReady()` hook + async `changeLanguage()` |
| Rust Tokio runtime panic | `main~8` | Replaced `std::thread::spawn` + `tokio::spawn` with `tauri::async_runtime::spawn` |

### P1 High — 3/3 Resolved
| Issue | Fix Commit | Resolution |
|-------|-----------|------------|
| IMAP/SMTP connection failures | `main~7` | Frontend 15s timeout wrapper + TLS port mapping docs |
| Account setup stuck states | `main~7` | `useReducer` state machine + `AbortController` for OAuth cancel |
| Workflow preset save failure | `main~6` | Inline error feedback for missing account/name validation |

### P2 Medium — 3/3 Resolved
| Issue | Fix Commit | Resolution |
|-------|-----------|------------|
| Missing translation keys | `main~3` | Full i18n audit on AddImapAccount + AddCalDavAccount |
| Empty states without actions | `main~3` | `NoAccountsEmptyState` component with "Add Account" button |
| Queue pause/resume persistence | `main~4` | Persist `queue_paused` to SQLite settings table |

### P3 Polish — 4/4 Resolved
| Issue | Fix Commit | Resolution |
|-------|-----------|------------|
| PGP tab clarity | `main~4` | Guided onboarding flow (4 steps) + help tooltip |
| Compliance tab education | `main~4` | Collapsible help section with profile docs + import JSON format |
| Template presets | `main~5` | 5 built-in templates seeded (migration v39) |
| Composer presets | `main~2` | Composer formatting profiles per account (migration v40) |

---

*Document superseded. Current roadmap is in `docs/velo-replan.md`.*
