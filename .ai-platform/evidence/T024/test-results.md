# T024 Test Results

## Initial Failing Tests

Command:

```bash
npx vitest run src/router/navigate.test.ts src/services/db/threadWorkStates.test.ts
```

Result:

- Failed as expected before implementation.
- `navigateToLabel("needs-reply")` routed to `/label/$labelId`.
- `getThreadsForWorkStates` and `getDueSoonThreads` were not implemented.

## Targeted Passing Tests

Command:

```bash
npx vitest run src/router/navigate.test.ts src/services/db/threadWorkStates.test.ts
```

Result:

- 2 test files passed.
- 40 tests passed.

## Type Check

Command:

```bash
npx tsc --noEmit
```

Result:

- Passed.

## I18n / UI Targeted Tests

Command:

```bash
npx vitest run src/i18n/i18n.test.ts src/i18n/settings.test.ts src/components/email/ThreadCard.test.tsx src/components/search/CommandPalette.test.tsx src/router/navigate.test.ts src/services/db/threadWorkStates.test.ts
```

Result:

- 6 test files passed.
- 56 tests passed.

## Sidebar Render Regression

Command:

```bash
npx vitest run src/components/layout/Sidebar.test.tsx
```

Result:

- 1 test file passed.
- 2 tests passed.
- Verified Follow-up appears before traditional mailboxes and Needs Reply calls `navigateToLabel("needs-reply")`.

## Full Test Suite

Command:

```bash
npm run test
```

Result:

- 187 test files passed.
- 1746 tests passed.

## Diff Check

Command:

```bash
git diff --check
```

Result:

- Passed.

## Dev Server Smoke

Command:

```bash
npm run dev -- --host 127.0.0.1
```

Result:

- Vite started successfully at `http://127.0.0.1:1420/`.
- In-app browser could open the Vite page, but the page entered the existing Tauri API error boundary because the SQL/window IPC APIs are unavailable outside the Tauri desktop runtime.
- Treat this as an environment limitation, not visual acceptance. Final UI screenshot QA still needs Tauri runtime coverage.
