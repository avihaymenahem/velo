---
name: git-governance
description: Use when managing Kirje branches, staging, commits, pull requests, upstream sync, release handoff, or any Git workflow decision. Enforces safe worktree handling, Conventional Commits, branch naming, review gates, and release-please compatibility.
---

# Kirje Git Governance

Use this skill whenever Git state changes or Git handoff decisions are involved. The goal is traceable maintenance, not fast-looking commits.

## Branch Policy

- Use `codex/<short-purpose>` for Codex-owned work branches unless the user requests another prefix.
- Keep `main` reviewable and releasable.
- Do not work directly on `main` for non-trivial changes.
- Track upstream Velo as a patch source, not a product source. Do not bulk-merge upstream.

## Worktree Policy

1. Run `git status --short` before edits, staging, commits, pulls, rebases, or pushes.
2. Treat uncommitted user changes as owned by the user unless clearly created in the current task.
3. Do not use destructive commands such as `git reset --hard`, `git checkout --`, or force push without explicit user approval.
4. Prefer specific path staging over `git add .`.
5. Keep governed tasks reviewable: avoid mixing unrelated product, security, CI, docs, and formatting changes in one commit.

## Commit Policy

Use Conventional Commits because release-please derives releases from commit history.

- `feat(scope): ...` for user-facing capability.
- `fix(scope): ...` for bug/security correctness fixes.
- `perf(scope): ...` for performance changes.
- `test(scope): ...` for test-only changes.
- `docs(scope): ...` for docs-only changes.
- `ci(scope): ...` for GitHub Actions or CI config.
- `build(scope): ...` for dependency/build system changes.
- `chore(scope): ...` for maintenance with no product behavior.

Prefer scopes: `security`, `db`, `oauth`, `imap`, `sync`, `queue`, `unsubscribe`, `phishing`, `ci`, `release`, `deps`, `i18n`, `ai`, `docs`.

Rules:

- First line under 72 characters.
- Lowercase type.
- Imperative description, no trailing period.
- `BREAKING CHANGE:` footer only with explicit approval.
- Do not commit failing validation unless the commit is explicitly a failing-test checkpoint requested by the user.

## PR Policy

- PR description must include: goal, changed files, validation, residual risks, and user-facing impact.
- Security/auth/db/sync changes must mention threat model limits.
- If release-please should not create a release, use `test`, `docs`, `ci`, `build`, or `chore` as appropriate.

## Upstream Policy

- For Velo PRs, classify as `adopt`, `adapt`, `reject`, or `defer`.
- Prefer cherry-picking logic manually over merge commits.
- High-risk upstream slices need tests and `.ai-platform/evidence/<task-id>/`.
- Never inherit upstream product direction blindly.

## Handoff Checklist

Before asking the user to review:

- `git diff --check` passes.
- Relevant targeted tests pass.
- Broader validation matches risk.
- Evidence exists for governed tasks.
- Residual risks are written plainly.

## Generated Evidence Policy

- Do not commit `.ai-platform/evidence/**/diff.patch`; it is a generated snapshot and becomes stale easily.
- Commit human-readable evidence such as `summary.md` and `test-results.md`.
- Use Git/PR diff as the source of truth for code review.
