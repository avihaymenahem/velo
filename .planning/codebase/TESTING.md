# Testing Patterns

**Analysis Date:** 2026-02-24

## Test Framework

**Runner:**
- Vitest 4.0.18
- Config: `vitest.config.ts`

**Environment:**
- jsdom (browser DOM simulation)
- Globals enabled: `globals: true` (no imports needed for `describe`, `it`, `expect`)

**Assertion Library:**
- Vitest native (equivalent to Jest)
- Testing Library for React components: `@testing-library/react` 16.3.2
- DOM matchers: `@testing-library/jest-dom` 6.9.1

**Run Commands:**
```bash
npm run test              # Run all tests (single run)
npm run test:watch       # Run tests in watch mode
npx vitest run src/stores/uiStore.test.ts  # Run single test file
```

## Test File Organization

**Location:**
- Colocated with source files (same directory)
- Example: `src/stores/uiStore.ts` + `src/stores/uiStore.test.ts`

**Naming:**
- `.test.ts` for utilities and services
- `.test.tsx` for React components

**File count:**
- 132 test files across entire codebase
- ~21,951 lines of test code total
- Distribution: stores (8), services (70), utils (14), components (32), constants (3), router (1), hooks (2), config (1)

## Test Structure

**Suite Organization:**
All tests use `describe()` blocks wrapping related test cases.

```typescript
describe("uiStore", () => {
  beforeEach(() => {
    // Reset state before each test
    useUIStore.setState({
      theme: "system",
      sidebarCollapsed: false,
      readingPanePosition: "right",
    });
  });

  it("should have correct default values", () => {
    const state = useUIStore.getState();
    expect(state.theme).toBe("system");
  });

  it("should set theme", () => {
    useUIStore.getState().setTheme("dark");
    expect(useUIStore.getState().theme).toBe("dark");
  });
});
```

**Patterns:**

**Setup (beforeEach):**
- Reset store state via `.setState()` for clean test isolation
- Clear mock call history: `vi.clearAllMocks()`
- Reset modules: `vi.resetModules()` for tests that import dynamically
- Use fake timers for time-dependent tests: `vi.useFakeTimers()`
- Pre-seed mock data for integration tests

**Teardown (afterEach):**
- Restore real timers: `vi.useRealTimers()` after fake timer tests
- Suppress console output during tests: `console.error = originalError`
- No cleanup needed for stores (reset in beforeEach)

**Assertion patterns:**
```typescript
expect(state.theme).toBe("system");
expect(state.accounts).toHaveLength(0);
expect(setSetting).toHaveBeenCalledWith("sidebar_collapsed", "true");
expect(mockSearchContacts).not.toHaveBeenCalled();
expect(screen.getByText("All good")).toBeInTheDocument();
```

## Mocking

**Framework:** Vitest `vi` module

**Patterns:**

**Module mocking (vi.mock):**
Place at top of test file before imports; mocked module is imported after:
```typescript
vi.mock("@/services/db/settings", () => ({
  setSetting: vi.fn(() => Promise.resolve()),
}));

import { setSetting } from "@/services/db/settings";
```

**Function mocking:**
```typescript
const mockSearchContacts = vi.fn().mockResolvedValue([]);
vi.mock("@/services/db/contacts", () => ({
  searchContacts: (...args: unknown[]) => mockSearchContacts(...args),
}));
```

**Mock assertions:**
```typescript
expect(mockSearchContacts).toHaveBeenCalledWith("jo", 5);
expect(mockSearchContacts).toHaveBeenCalledTimes(1);
expect(setSetting).toHaveBeenCalledWith("sidebar_collapsed", "true");
expect(mockSearchContacts).not.toHaveBeenCalled();
expect(setSetting).not.toHaveBeenCalled();
```

**Return value overrides:**
```typescript
const mockGetTaskById = vi.mocked(getTaskById);
mockGetTaskById.mockResolvedValue({
  id: "t1",
  account_id: "acc1",
  title: "Test",
  // ... full object
});
```

**What to Mock:**
- External services (DB, Gmail API, IMAP)
- Async operations that are tested elsewhere
- Any function that makes network calls
- UI elements that would require DOM rendering context
- Tauri plugin calls (`@tauri-apps/api`, `@tauri-apps/plugin-fs`, etc.)

**What NOT to Mock:**
- Pure utility functions (parse, format, calculate functions)
- Store methods when testing the store itself
- React hooks when testing component behavior directly
- Database connection singleton when testing query functions

## Fixtures and Factories

**Test Data Builders:**
Centralized in `src/test/mocks/`:

- `entities.mock.ts` — Builds test data objects:
  ```typescript
  createMockParsedMessage(overrides?: Partial<ParsedMessage>)
  createMockGmailMessage(overrides?: Partial<GmailMessage>)
  createMockGmailAccount(overrides?: Partial<DbAccount>)
  createMockImapAccount(overrides?: Partial<DbAccount>)
  createMockDbAccount(overrides?: Partial<DbAccount>)
  createMockImapMessage(overrides?: Partial<ImapMessage>)
  createMockImapFolder(overrides?: Partial<ImapFolder>)
  createMockQuickStep(overrides?: Partial<QuickStep>)
  ```

- `services.mock.ts` — Mocks service/provider objects:
  ```typescript
  createMockGmailClient(overrides?: Record<string, unknown>)
  createMockEmailProvider(overrides?: Record<string, unknown>)
  createMockAiProvider(response?: string)
  createMockFetchResponse(overrides?: { status, ok, data, headers })
  ```

- `stores.mock.ts` — Mocks store states:
  ```typescript
  createMockUIStoreState(overrides)
  createMockThreadStoreState(overrides)
  createMockAccountStoreState(overrides)
  ```

- `db.mock.ts` — Mocks database connection:
  ```typescript
  createMockDb()  // Returns { select: vi.fn(), execute: vi.fn() }
  ```

- `tauri.mock.ts` — Mocks Tauri filesystem:
  ```typescript
  createMockTauriFs()  // Returns mock with .mock, .store for testing
  createMockTauriPath()
  ```

**Location:**
- All factories exported from `src/test/mocks/index.ts`
- Shared across all tests via `@/test/mocks` import

**Usage pattern:**
```typescript
const mockAccount: Account = {
  id: "acc-1",
  email: "test@gmail.com",
  displayName: "Test User",
  avatarUrl: null,
  isActive: true,
};

it("should add an account", () => {
  useAccountStore.getState().addAccount(mockAccount);
  expect(useAccountStore.getState().accounts).toHaveLength(1);
});
```

## Coverage

**Requirements:** Not enforced in codebase (no coverage threshold detected)

**Areas with high test coverage:**
- Stores (8 test files): 100% of state mutations tested
- Utilities (14 test files): Most utility functions tested, especially parsing/formatting
- Services (70 test files): Core business logic well covered
- Components (32 test files): Critical UI logic tested

**View Coverage:**
- No coverage reporting tool configured
- No coverage reports in CI/build pipeline detected

## Test Types

**Unit Tests:**
- Scope: Individual functions (pure functions, store mutations, service methods)
- Approach: Test single function with mocked dependencies
- Example: `crypto.test.ts` tests `encryptValue()`, `decryptValue()`, `isEncrypted()` functions
- Mock async dependencies: DB calls, API calls
- Assert direct outputs and state changes

**Integration Tests:**
- Scope: Multiple functions working together (store + DB, service + API)
- Approach: Mock external boundaries (DB, network) but test actual code paths
- Example: `sync.test.ts` tests sync flow with mocked DB, Gmail API, filters, categories
- Mock depth limited to actual service boundaries
- Assert state consistency across operations

**Component Tests:**
- Scope: React component rendering and user interaction
- Framework: React Testing Library
- Approach: Render component, simulate user actions, assert DOM changes
- Example: `AddressInput.test.tsx` tests debounce behavior on typing
- Mock service dependencies but render actual component
- Assert DOM queries: `screen.getByRole()`, `screen.getByText()`, etc.

**E2E Tests:**
- Type: Not found in codebase
- Coverage: No end-to-end test suite detected

## Common Patterns

**Async Testing:**

Using `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()`:
```typescript
it("should search after debounce period", async () => {
  const onChange = vi.fn();
  const { getByRole } = render(
    <AddressInput label="To" addresses={[]} onChange={onChange} />,
  );

  const input = getByRole("textbox", { name: "To" });
  fireEvent.change(input, { target: { value: "jo" } });

  // Advance past 200ms debounce
  await vi.advanceTimersByTimeAsync(250);
  expect(mockSearchContacts).toHaveBeenCalledWith("jo", 5);
});
```

Promise assertions:
```typescript
it("decryptValue throws on invalid format", async () => {
  const { decryptValue } = await import("./crypto");
  await expect(decryptValue("not-valid")).rejects.toThrow("Invalid encrypted value format");
});
```

**Error Testing:**

Testing error conditions and recovery:
```typescript
it("renders custom fallback when provided", () => {
  render(
    <ErrorBoundary fallback={<div>Custom fallback</div>}>
      <ThrowingComponent message="Test error" />
    </ErrorBoundary>,
  );
  expect(screen.getByText("Custom fallback")).toBeInTheDocument();
});

it("recovers when 'Try again' is clicked and child no longer throws", () => {
  let shouldThrow = true;

  function MaybeThrow() {
    if (shouldThrow) throw new Error("Conditional error");
    return <div>Recovered</div>;
  }

  render(
    <ErrorBoundary>
      <MaybeThrow />
    </ErrorBoundary>,
  );

  expect(screen.getByText("Something went wrong")).toBeInTheDocument();

  shouldThrow = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  // Assert recovery...
});
```

**Zustand Store Testing:**

Reset store state before each test:
```typescript
beforeEach(() => {
  useUIStore.setState({
    theme: "system",
    sidebarCollapsed: false,
    readingPanePosition: "right",
  });
});

it("should toggle sidebar", () => {
  useUIStore.getState().toggleSidebar();
  expect(useUIStore.getState().sidebarCollapsed).toBe(true);

  useUIStore.getState().toggleSidebar();
  expect(useUIStore.getState().sidebarCollapsed).toBe(false);
});
```

**Task/Recurrence Testing:**

Testing state mutations with mocked dependencies:
```typescript
it("creates next occurrence for recurring task", async () => {
  vi.mocked(getTaskById).mockResolvedValue({
    id: "t1",
    account_id: "acc1",
    title: "Test",
    recurrence_rule: '{"type":"daily","interval":1}',
    next_recurrence_at: null,
    // ... full object
  });

  const result = await handleRecurringTaskCompletion("t1");
  expect(completeTask).toHaveBeenCalledWith("t1");
  expect(insertTask).toHaveBeenCalledWith(
    expect.objectContaining({
      id: expect.any(String),
      title: "Test",
    }),
  );
  expect(result).toEqual(expect.objectContaining({ id: expect.any(String) }));
});
```

## Test Coverage Gaps

**Areas with limited coverage:**
- Multi-window threading logic (`ThreadWindow.tsx`, `ComposerWindow.tsx`) — component integration not tested
- Real-time sync behavior (`startBackgroundSync()` — uses intervals, hard to test comprehensively)
- Tauri-specific features (tray, notifications) — require desktop environment
- Deep linking and protocol handlers (`deepLinkHandler.ts`) — require system integration
- Global shortcuts (`globalShortcut.ts`) — require OS-level APIs

**How to improve:**
- Add E2E tests using Playwright or Cypress for real desktop app behavior
- Mock timer-based intervals more extensively
- Test Tauri command round-trips with stubs
- Add integration tests for sync pipeline (currently mocked at boundaries)

---

*Testing analysis: 2026-02-24*
