# Coding Conventions

**Analysis Date:** 2026-02-24

## Naming Patterns

**Files:**
- Kebab case for component files: `ThreadCard.tsx`, `ErrorBoundary.tsx`, `ScheduleSendDialog.tsx`
- Kebab case for utility files: `emailUtils.ts`, `networkErrors.ts`, `phishingDetector.ts`
- Kebab case for service files: `draftAutoSave.ts`, `tokenManager.ts`, `syncManager.ts`
- Test files use `.test.ts` or `.test.tsx` suffix colocated with source: `EmailList.tsx` + `EmailList.test.tsx`
- Store files: `uiStore.ts`, `accountStore.ts`, `threadStore.ts`

**Functions:**
- camelCase for all function names: `normalizeEmail()`, `classifyError()`, `getNextThreadId()`, `applyOptimisticUpdate()`
- Getter functions use `get` prefix: `getDb()`, `getNextThreadId()`, `getSelectedThreadId()`, `getEmailProvider()`
- Setter/modifier functions use `set` prefix or action verbs: `setSetting()`, `toggleSidebar()`, `archiveThread()`
- Event handlers use `handle` prefix: `handleClick()`, `handleContextMenu()`, `handleChange()`
- Async functions use verb + noun pattern: `initializeClients()`, `startBackgroundSync()`, `loadThreads()`

**Variables:**
- camelCase for local and state variables: `const sidebarCollapsed = true`, `let isLoading = false`
- Use descriptive names: `selectedThreadId`, `pendingOpsCount`, `activeAccountId` (not shortened abbreviations)
- Boolean variables/state use `is` or `has` prefix: `isActive`, `isRead`, `hasAttachments`, `isSyncing`, `hasFollowUp`
- Set collections use plural names: `selectedThreadIds` (stores as Set), `vipSenders` (stores as Set)

**Types:**
- PascalCase for all types and interfaces: `type Theme = "light" | "dark" | "system"`, `interface UIState {}`, `type EmailAction = ...`
- Generic descriptive names: `type ReadingPanePosition = "right" | "bottom" | "hidden"`, `type ErrorType = "network" | "auth" | "quota" | "server" | "permanent"`
- Props interfaces use `Props` suffix: `interface ThreadCardProps {}`, `interface AddressInputProps {}`
- Database row types use `Db` prefix: `DbAccount`, `DbThread`, `DbMessage`
- Enum-like union types document possible values clearly: `type MarkAsReadBehavior = "instant" | "2s" | "manual"`

## Code Style

**Formatting:**
- Prettier (detected via package.json, auto-formatting on save)
- No explicit .prettierrc found; uses default Prettier settings
- Line width appears to be 100 characters (observed in code)
- Single quotes (detected in TypeScript files)
- Trailing commas in multi-line objects/arrays

**Linting:**
- ESLint configured (eslint.config.js in landing directory)
- TypeScript strict mode enabled: `strict: true`
- Unused variables/parameters flagged: `noUnusedLocals: true`, `noUnusedParameters: true`
- Exhaustive switch cases enforced: `noFallthroughCasesInSwitch: true`
- No unchecked indexed access: `noUncheckedIndexedAccess: true`
- These flags are NOT configurable in development — code must comply

**Whitespace & Spacing:**
- Two-space indentation (consistent across all files)
- Blank lines separate logical sections (e.g., "Action types", "Result type", "Optimistic UI helpers" in `emailActions.ts`)
- Comments use `// ` format for single-line, `/** */` for JSDoc
- Section dividers use `// ---------------------------------------------------------------------------` pattern

## Import Organization

**Order:**
1. External dependencies (React, third-party libraries)
2. Internal `@/` path-aliased imports (stores, services, components, utils)
3. Type imports when necessary (destructured or as separate lines)

**Examples from codebase:**
```typescript
// Pattern 1: Component imports
import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { ThreadCard } from "../email/ThreadCard";
import { CategoryTabs } from "../email/CategoryTabs";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { getThreadsForAccount } from "@/services/db/threads";

// Pattern 2: Service imports with vi.mock above
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/services/db/settings", () => ({
  setSetting: vi.fn(() => Promise.resolve()),
}));
import { setSetting } from "@/services/db/settings";
```

**Path Aliases:**
- `@/*` maps to `src/*` (defined in `tsconfig.json` and `vitest.config.ts`)
- All imports use `@/` for internal modules, never relative `../` paths

## Error Handling

**Patterns:**
- Errors classified by type using `classifyError()` utility (`networkErrors.ts`): network, auth, quota, server, permanent
- Classification includes `isRetryable` boolean for queue processor logic
- Network errors checked via pattern matching: "failed to fetch", "timeout", "econnrefused", etc.
- HTTP status codes extracted and classified: 401/403 = auth, 429 = quota, 5xx = server
- Try-catch blocks around async operations, especially in stores and components
- Errors logged with `console.error()` when unhandled, with context: `console.error("Failed to initialize:", err)`
- Offline queue uses exponential backoff: 60s → 300s → 900s → 3600s (seen in `queueProcessor.ts`)

**Service layer example** (`emailActions.ts`):
```typescript
function applyOptimisticUpdate(action: EmailAction): void {
  const store = useThreadStore.getState();
  switch (action.type) {
    case "archive":
    case "trash":
    case "permanentDelete":
      // ... update logic
      break;
  }
}
```

**Component error handling**:
- Wrap with `<ErrorBoundary>` component for rendering errors
- Components use `try-catch` in event handlers
- Async operations in `useEffect` reject silently or log: `.catch((err) => console.error("...", err))`

## Logging

**Framework:** `console` object only (no logger library)

**Patterns:**
- `console.error()` for errors: `console.error("Failed to initialize:", err)`
- `console.warn()` for warnings: `console.warn("Failed to fetch send-as aliases for account:", err)`
- **No debug logging** in production code (no `console.log()` calls found in services/stores)
- Logging includes context and error: `console.error("Failed to load threads:", err)`
- Errors logged with function context for debugging
- Suppress console during tests using `beforeEach/afterEach` to avoid noise (seen in ErrorBoundary test)

## Comments

**When to Comment:**
- Complex algorithms: threading logic (`threadBuilder.ts`), phishing detection rules
- Non-obvious business logic: "Prefer next thread, fall back to previous" (auto-advance logic)
- RFC compliance notes: "Email addresses are case-insensitive per RFC 5321"
- Security-relevant code: encryption, token handling
- Configuration notes: "Tauri SQL plugin config: preload must be an array, NOT an object"

**JSDoc/TSDoc:**
- Used for public exported functions and types
- Rare in test files, common in utilities and services
- Example: `/** Build a dynamic SQL UPDATE statement from a set of field updates. Returns null if no fields to update. */`
- Type parameters documented inline in function signatures

**Comment placement:**
- Comments appear above code blocks or on same line for short notes
- Section dividers (`// -----...-----`) separate major sections within files

## Function Design

**Size:**
- Most functions kept under 50 lines
- Complex logic (parsing, synchronization) may extend to 100+ lines but remain well-organized
- Service functions are pure or async-only, avoiding complex control flow

**Parameters:**
- Prefer destructuring over positional args for objects: `{ width, listRef }` in component props
- Type all parameters explicitly (strict TypeScript)
- Use optional params with `?` notation: `onContextMenu?: (e: React.MouseEvent, threadId: string) => void`
- Rest parameters for variable args: `...args: unknown[]`

**Return Values:**
- Explicit return types on all functions
- Union types for conditional returns: `string | null`, `Thread | undefined`
- Promise returns for async: `Promise<Database>`, `Promise<void>`
- Discriminated unions for complex results: `type EmailAction = | { type: "archive"; ... } | { type: "trash"; ... }`

**Example function** from `emailActions.ts`:
```typescript
function getNextThreadId(currentId: string): string | null {
  const selectedId = getSelectedThreadId();
  if (selectedId !== currentId) return null;
  const { threads } = useThreadStore.getState();
  const idx = threads.findIndex((t) => t.id === currentId);
  if (idx === -1) return null;
  const next = threads[idx + 1];
  if (next) return next.id;
  const prev = threads[idx - 1];
  if (prev) return prev.id;
  return null;
}
```

## Module Design

**Exports:**
- Named exports preferred: `export function`, `export type`, `export interface`
- Default exports rare (only seen in React components in some cases)
- Barrel files not used; imports are explicit
- All public APIs explicitly exported

**Barrel Files:**
- Used strategically: `src/test/mocks/index.ts` re-exports all mock factories
- Not over-used; most modules import directly from source files

**Zustand Store Pattern:**
- Stores export `useXStore` hook created via `create<State>((set) => ({...}))`
- State interface defines all properties and methods
- Setters use direct `set()` or `set((state) => ({...}))` for derived updates
- Stores are synchronous (no async middleware)
- Direct state access via `.getState()` for non-subscription contexts

**Example store** (`uiStore.ts`):
```typescript
interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "system",
  sidebarCollapsed: false,
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () =>
    set((state) => {
      const collapsed = !state.sidebarCollapsed;
      setSetting("sidebar_collapsed", String(collapsed)).catch(() => {});
      return { sidebarCollapsed: collapsed };
    }),
}));
```

## React Component Patterns

**Functional components:**
- All components are functional (React 19)
- Use `memo()` for components that subscribe to stores to optimize re-renders
- Props interface typed explicitly
- Hooks called at top level

**Example pattern** (`ThreadCard.tsx`):
```typescript
interface ThreadCardProps {
  thread: Thread;
  isSelected: boolean;
  onClick: (thread: Thread) => void;
  onContextMenu?: (e: React.MouseEvent, threadId: string) => void;
}

export const ThreadCard = memo(function ThreadCard({
  thread, isSelected, onClick, onContextMenu
}: ThreadCardProps) {
  // ... implementation
});
```

---

*Convention analysis: 2026-02-24*
