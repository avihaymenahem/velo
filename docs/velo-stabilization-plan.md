# Velo Stabilization Plan

This document describes the stabilization work for the forked Velo app and the current recommendations for keeping the project aligned with upstream reliability improvements.

## Purpose

The fork combines substantial feature work with upstream stabilization efforts. This plan clarifies what has been integrated, where the remaining risk lies, and what should come next.

## Current status

- The fork is currently based on version `0.4.22`.
- The codebase includes feature work in PGP, compliance, templates, vaults, filters, workflows, campaigns, and AI.
- Upstream stabilization work has been merged into the fork where possible.
- The current branch passes 142 test files and maintains a local-first architecture.

## Stabilization focus areas

### Reliability

- Fixed migration issues and SQLite stability problems.
- Improved IMAP reliability for shared folders, UIDVALIDITY changes, and connection handling.
- Added support for separate SMTP credential storage and handling.

### Security

- Hardened CSP and Tauri capability rules.
- Improved unsubscribe handling and DB crypto use.
- Added custom AI provider support with explicit permission controls.

### Compatibility

- Added two new locales: Japanese and Italian.
- Fixed iCal UTC handling and iframe link behavior.
- Updated dependencies for Rust, frontend, and security libraries.

## Remaining issues

1. **Git remote push failure** due to SSL certificate/ca-bundle issues.
2. **Rust Windows build environment** requires MSVC toolchain; MinGW is not sufficient for release builds.
3. **Upstream PRs and issues** should be reviewed regularly to avoid fork drift.
4. **Documentation cleanup** is required so that consumer docs reflect feature behavior rather than development phase markers.

## Recommended next steps

- Validate the current branch with a full `cargo build` on a proper MSVC Windows environment.
- Fix remote Git push issues and establish a stable repo sync process.
- Continue incremental feature work through short-term roadmap items.
- Keep stabilization work grouped by category: reliability, security, compatibility.
- Maintain a single source of truth for docs in `docs/` and remove planning artifacts from release documentation.

## Applied upstream work

- Critical bug fixes for migration, iCal, iframe links, CSP, HTTP ports, and shortcuts.
- Security hardening across unsubscribe, database services, and plugin permission handling.
- IMAP reliability improvements in `connection.ts`, `imapSync.ts`, `folderMapper.ts`, `imapConfigBuilder.ts`, and Rust IMAP client code.
- Custom OpenAI-compatible AI provider and settings UI.
- Separate SMTP credential storage and account migration handling.
- Export scheduler wiring in `src-tauri/src/lib.rs`.

## Documentation note

This plan should remain focused on stabilization and should not be used as a feature completion checklist. Feature descriptions belong in the individual docs under `docs/` and should explain how the feature works, why it exists, where it is implemented, and when it is intended to be used.
