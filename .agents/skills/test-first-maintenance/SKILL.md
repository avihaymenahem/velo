---
name: test-first-maintenance
description: Use when maintaining Kirje code, adapting upstream PRs, fixing bugs, hardening security/privacy paths, changing database/sync/auth/email behavior, or reviewing vibe-coded changes where regression risk must be controlled with tests before implementation.
---

# Kirje Test-First Maintenance

Use this skill for Kirje maintenance work where behavior can regress. The default is test-first, because this repository is inherited and broad enough that intuition is not a quality gate.

## Rule

For behavior changes, security fixes, database changes, sync changes, auth/OAuth changes, email send/delete/archive changes, AI automation, and upstream PR adaptation:

1. Write or identify the smallest failing regression test first.
2. Run the targeted test and record the failure, unless the existing suite already has a failing test.
3. Make the smallest implementation change that turns the test green.
4. Run targeted validation again.
5. Run broader validation proportional to risk.
6. Record evidence: failing test summary, passing commands, changed files, and residual risk.

## Allowed Exceptions

Do not force test-first for:

- Pure documentation changes.
- Formatting-only changes.
- CI wiring where the validation command itself is the test.
- Exploratory read-only audits.

If skipping test-first for a behavior change, state the reason in the final report or `.ai-platform/evidence/<task-id>/summary.md`.

## Validation Ladder

Pick the smallest reliable ladder, then expand when risk is high:

- TypeScript service/component change: targeted `npx vitest run <file>` then `npx tsc --noEmit`; run `npm run test` for shared logic or security.
- Rust command/security/auth change: targeted or full `cargo test --locked`; run `cargo build --locked` for compile surface.
- Database migration/repair: migration regression tests, `npx tsc --noEmit`, full `npm run test`, and Rust validation if Tauri state may be affected.
- Release/CI/dependency change: `npm audit --audit-level=moderate`, `npm run test`, `cargo test --locked`, and `cargo build --locked` as relevant.

## Review Standard

Treat missing tests as a product risk, not a style nit. A fix without a regression test is acceptable only when the behavior cannot be tested locally or the test would be fake; record that explicitly.
