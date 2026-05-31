---
name: release-governance
description: Maintain Kirje commit, CI, versioning, and release automation. Use when changing GitHub Actions, release-please, package/version files, signing/notarization, updater endpoints, Homebrew/Flatpak/RPM packaging, dependency audit policy, or preparing release handoff evidence.
---

# Kirje Release Governance

Use this skill for Kirje release, version, CI, and packaging work. Keep the goal narrow: protect automated releases without letting release plumbing drive product direction.

## Required Checks

Before changing CI/CD or release files:

1. Check worktree with `git status --short`.
2. Inspect relevant files:
   - `.github/workflows/*.yml`
   - `release-please-config.json`
   - `.release-please-manifest.json`
   - `package.json`
   - `package-lock.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
   - `src-tauri/tauri.conf.json`
   - packaging files such as `velo.spec`, `com.velomail.app.yml`, and Homebrew workflow.
3. Identify whether the change is CI validation, versioning, release asset build, signing/notarization, updater, packaging, or dependency security.
4. For high-risk release changes, create or update `.ai-platform` evidence.

## Commit Policy

Use Conventional Commits because release-please derives version bumps from commit history.

- `feat(...)`: minor release.
- `fix(...)`, `perf(...)`: patch release.
- `ci(...)`, `build(...)`, `chore(...)`, `docs(...)`, `test(...)`: no release unless release-please config changes that behavior.
- `BREAKING CHANGE:` footer: major release. Use only with explicit approval.

Prefer scopes such as `ci`, `release`, `deps`, `tauri`, `packaging`, `updater`, `security`, `imap`, `sync`, `ai`, or `i18n`.

## CI Baseline

CI should protect at least:

- `npm ci`
- `npm audit --audit-level=moderate`
- `npx tsc --noEmit`
- `npm run test`
- `cargo test --locked` from `src-tauri`
- `cargo build --locked` from `src-tauri`

Use Linux Tauri system dependencies before Rust build/test in GitHub Actions.

## Release-Please Policy

Release automation should keep these files in sync:

- `package.json`
- `package-lock.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` when Cargo rewrites the local package version
- packaging metadata files

Do not switch product identifiers, updater endpoints, signing keys, Homebrew tap, or bundle IDs without a dedicated governed task. Those are release-breaking changes.

## Validation

For CI/release changes, run the relevant local subset:

```bash
npm audit --audit-level=moderate
npx tsc --noEmit
npm run test
cd src-tauri && cargo test --locked
cd src-tauri && cargo build --locked
```

If local validation cannot cover GitHub-only behavior, state that explicitly and rely on GitHub Actions after push.

## Handoff

Report:

- Changed release/CI files.
- Commands run and exit status.
- Remaining release blockers.
- Required GitHub secrets, if any.
- Whether the change affects version bump behavior or only validation.
