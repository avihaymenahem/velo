---
name: commit
description: Create a conventional commit and push to the current branch. Ensures commit messages follow the Conventional Commits spec for automatic versioning with release-please.
argument-hint: [optional commit description]
---

# Conventional Commit

Create a git commit following the [Conventional Commits](https://www.conventionalcommits.org/) specification. This is required for release-please to auto-determine version bumps.

## Steps

1. **Check the current state** — run `git status` (no `-uall` flag) and `git diff --staged` to understand what's being committed. If nothing is staged, stage the relevant files (prefer specific files over `git add .`).

2. **Determine the commit type** from the changes:

   | Type | When to use | Version bump |
   |------|------------|--------------|
   | `feat` | New feature or capability | **minor** (0.x.0) |
   | `fix` | Bug fix | **patch** (0.0.x) |
   | `docs` | Documentation only | no release |
   | `style` | Formatting, whitespace, semicolons (no logic change) | no release |
   | `refactor` | Code restructuring (no feature/fix) | no release |
   | `perf` | Performance improvement | **patch** (0.0.x) |
   | `test` | Adding or fixing tests | no release |
   | `build` | Build system, dependencies, CI | no release |
   | `chore` | Maintenance, tooling, configs | no release |
   | `ci` | CI/CD pipeline changes | no release |
   | `revert` | Reverting a previous commit | depends on reverted type |

3. **Format the commit message** strictly as:
   ```
   type(scope): short description

   Optional longer body explaining the "why" (not the "what").

   BREAKING CHANGE: description (if applicable)
   ```

   Rules:
   - **type** is required, lowercase
   - **scope** is optional but encouraged — use the affected area (e.g., `composer`, `sync`, `settings`, `db`, `ui`, `ai`, `calendar`, `auth`, `search`, `shortcuts`, `tray`, `notifications`, `labels`, `filters`, `queue`, `imap`, `attachments`)
   - **description** starts lowercase, no period at end, imperative mood ("add" not "added")
   - **BREAKING CHANGE** footer triggers a **major** version bump — use sparingly
   - Keep the first line under 72 characters

4. **Examples:**
   ```
   feat(composer): add scheduled send with date picker
   fix(sync): handle expired Gmail history token gracefully
   refactor(db): consolidate migration helpers
   docs: update keyboard shortcuts table in CLAUDE.md
   chore(ci): add release-please workflow
   perf(search): use FTS5 trigram index for faster lookups
   feat(ai)!: switch to streaming responses

   BREAKING CHANGE: AI provider interface now requires stream() method
   ```

5. **Create the commit** using a HEREDOC for proper formatting:
   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): description
   EOF
   )"
   ```

6. **Push to the current branch** with `git push`. If the branch has no upstream, use `git push -u origin HEAD`.

## User hint

$ARGUMENTS
