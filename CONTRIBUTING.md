# Contributing to Velo

Thank you for your interest in contributing to Velo! This guide will help you get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Setup

```bash
git clone https://github.com/avihaymenahem/velo.git
cd velo
npm install
npm run tauri dev
```

## Development Workflow

1. **Fork** the repository and create a branch from `main`
2. **Make your changes** -- see the sections below for guidelines
3. **Run tests** before submitting: `npm run test`
4. **Type-check** your code: `npx tsc --noEmit`
5. **Open a pull request** against `main`

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `src-tauri/` | Rust backend (Tauri commands, plugins, system tray) |
| `src/components/` | React UI components (12 groups) |
| `src/stores/` | Zustand state stores |
| `src/services/` | Business logic (email, AI, sync, DB) |
| `src/services/db/` | SQLite query functions and migrations |
| `src/hooks/` | Custom React hooks |
| `src/constants/` | Static data (shortcuts, themes, help content) |
| `src/utils/` | Shared utility functions |

For detailed architecture, see [docs/architecture.md](docs/architecture.md).

## Code Guidelines

### TypeScript / React

- **Strict mode** is enabled (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`)
- **Avoid `useEffect`** where possible -- prefer derived state, event handlers, `useMemo`, or refs
- **Tailwind CSS v4** for all styling -- use semantic color tokens (`bg-bg-primary`, `text-text-primary`, etc.)
- **Icons** from `lucide-react`
- **Path alias**: use `@/` to import from `src/`

### Rust

- Backend code lives in `src-tauri/src/`
- New Tauri commands must be registered in `src-tauri/src/lib.rs`
- New plugins need permissions added to `src-tauri/capabilities/default.json`

### Database

- Migrations go in `src/services/db/migrations.ts` -- always add to the end of the array
- Never modify existing migrations; only append new ones
- Query functions go in `src/services/db/` as separate files

### Testing

- Write tests for new code -- tests are colocated with source files (e.g., `foo.test.ts` next to `foo.ts`)
- Run the full suite with `npm run test`
- Run a single file with `npx vitest run <path>`
- We use **Vitest** with `globals: true` (no need to import `describe`, `it`, `expect`)

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning:

```
feat: add snooze presets to context menu
fix: prevent duplicate sync on reconnect
docs: update keyboard shortcuts reference
refactor: extract email parser into separate module
test: add coverage for filter engine AND logic
chore: bump tauri to v2.10
```

## Pull Requests

- Fill out the [PR template](.github/pull_request_template.md)
- Keep PRs focused -- one feature or fix per PR
- Include screenshots for UI changes
- Ensure all tests pass and there are no type errors

## Reporting Bugs

Use the [bug report template](https://github.com/avihaymenahem/velo/issues/new?template=bug_report.yml) on GitHub Issues. Include:

- Steps to reproduce
- Expected vs. actual behavior
- OS and Velo version
- Screenshots or logs if applicable

## Feature Requests

Use the [feature request template](https://github.com/avihaymenahem/velo/issues/new?template=feature_request.yml) on GitHub Issues.

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).
