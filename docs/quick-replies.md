# Quick Reply Templates

## 1. Overview

Quick Reply Templates let users save and reuse canned responses as HTML snippets. They appear in two places:

- **InlineReply** — a collapsible `QuickReplyList` panel below the TipTap editor
- **EditorToolbar** (full composer) — a `MessageSquarePlus` button with a dropdown menu

When the user clicks a template, its `body_html` is inserted at the cursor via `editor.chain().focus().insertContent(bodyHtml).run()`. Usage count is incremented on each insertion for analytics.

## 2. Data Model

**Table:** `quick_replies` (created in migration v34)

| Column | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `account_id` | `TEXT NOT NULL` | FK → `accounts(id) ON DELETE CASCADE` |
| `title` | `TEXT NOT NULL` | Display name |
| `body_html` | `TEXT NOT NULL` | HTML content inserted into editor |
| `shortcut` | `TEXT` | Optional label (e.g. `#thanks`) — shown as `<kbd>` badge |
| `sort_order` | `INTEGER DEFAULT 0` | Custom drag-reorder position |
| `usage_count` | `INTEGER DEFAULT 0` | Incremented on each insert |
| `created_at` | `INTEGER DEFAULT (unixepoch())` | Auto-set on insert |

**Index:** `idx_quick_replies_account ON quick_replies(account_id)`

**TypeScript type** (`src/services/db/quickReplies.ts`):

```typescript
interface QuickReply {
  id: string;
  account_id: string;
  title: string;
  body_html: string;
  shortcut: string | null;
  sort_order: number;
  usage_count: number;
  created_at: number;
}
```

## 3. QuickReplyList UI

**File:** `src/components/email/QuickReplyList.tsx`

- **Props:** `accountId: string`, `onInsert: (bodyHtml: string, title: string) => void`
- **Renders** a collapsible section (chevron toggle) below the inline reply editor, separated by `border-t border-border-secondary`
- **Header** shows `MessageSquarePlus` icon + "Quick Replies" label
- **List** displays each quick reply as a row with:
  - `Zap` icon (accent color)
  - Title (truncated with `flex-1 truncate`)
  - Optional `shortcut` badge rendered as `<kbd>` element
- **Empty state** shows "No quick replies yet. Create one in Settings" when there are 0 items and panel is expanded
- **Auto-hides** the entire component when `quickReplies.length === 0 && !expanded` (returns `null`)
- **Data loading** is lazy — only queries DB when expanded (via `useEffect` on `expanded` flag)
- **Insert action** calls `onInsert(qr.body_html, qr.title)` then `incrementQuickReplyUsage(qr.id)`

## 4. QuickReplyEditor (Settings)

**File:** `src/components/settings/QuickReplyEditor.tsx`

- **Rendered in** `SettingsPage` at the Quick Replies section
- **CRUD operations:**
  - **Create:** "Add quick reply" button opens an inline form with title, body (textarea, monospace), and shortcut fields
  - **Read:** loads all quick replies for the active account, ordered by `sort_order, created_at`
  - **Update:** `Pencil` button populates the form for editing; `upsertQuickReply` uses `ON CONFLICT(id) DO UPDATE`
  - **Delete:** `Trash2` button calls `deleteQuickReply(id)`
- **Reordering:** `ChevronUp`/`ChevronDown` buttons swap `sort_order` values between adjacent items via two `upsertQuickReply` calls
- **Form fields:**
  - `title` — `TextField`, required (save disabled when empty)
  - `body_html` — `<textarea>` with monospace font, placeholder `<p>Your quick reply HTML here...</p>`
  - `shortcut` — `TextField`, optional, placeholder "Shortcut key (e.g. #thanks)"
- **Each list item** shows: `Zap` icon, title, shortcut `<kbd>` badge, usage count ("Used N times"), and action buttons

## 5. EditorToolbar Integration

**File:** `src/components/composer/EditorToolbar.tsx`

- **Button:** `MessageSquarePlus` icon + "Quick Replies" label, positioned next to the Templates button (separated by a flex spacer)
- **State:** `quickReplyOpen` boolean toggles a dropdown menu
- **Dropdown** (`absolute right-0 top-full`, `w-56`, `max-h-60 overflow-y-auto`):
  - Loads quick replies lazily when opened (`useEffect` on `quickReplyOpen`)
  - Click-outside closes via `mousedown` listener on `document`
  - Each item: `MessageSquarePlus` icon, title, optional `<kbd>` shortcut badge
  - Empty state: "No quick replies yet"
  - **Insert handler:** `editor.chain().focus().insertContent(qr.body_html).run()`, closes menu, increments usage

## 6. InlineReply Integration

**File:** `src/components/email/InlineReply.tsx`

- **Import:** `QuickReplyList` from `./QuickReplyList`
- **Rendered** below the `EditorContent` editor, before the footer toolbar — always present when inline reply is expanded
- **Insert callback:**
  ```typescript
  onInsert={(bodyHtml) => {
    editor?.chain().focus().insertContent(bodyHtml).run();
  }}
  ```
  The `title` parameter from QuickReplyList's `onInsert` is unused here (only `bodyHtml` is passed).
- Uses `editor.chain().focus().insertContent()` (TipTap v3 API) — inserts HTML at cursor position and focuses the editor

## 7. Migration v34

**File:** `src/services/db/migrations.ts` (line 1012)

```sql
CREATE TABLE IF NOT EXISTS quick_replies (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  shortcut TEXT,
  sort_order INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_quick_replies_account ON quick_replies(account_id);
```

## 8. File Map

| File | Purpose |
|---|---|
| `src/services/db/quickReplies.ts` | Data access layer — `getQuickReplies`, `upsertQuickReply`, `deleteQuickReply`, `incrementQuickReplyUsage` |
| `src/components/email/QuickReplyList.tsx` | Collapsible sidebar list in InlineReply — lazy loads, insert callback, shortcut badges |
| `src/components/settings/QuickReplyEditor.tsx` | Settings CRUD UI — form, reorder, delete, usage display |
| `src/components/composer/EditorToolbar.tsx` | Full-composer toolbar — `MessageSquarePlus` dropdown, lazy load, insert via TipTap |
| `src/components/email/InlineReply.tsx` | Inline reply editor — mounts `QuickReplyList` and wires `insertContent` |
| `src/services/db/migrations.ts` | Migration v34 — `quick_replies` table + index DDL |
| `src/locales/en/translation.json` | i18n keys: `quickReply.title`, `.noReplies`, `.createInSettings`, `.body`, `.shortcut`, `.sortOrder` |

## 9. Keyboard Shortcut

Quick replies use **per-item shortcut labels** (stored in the `shortcut` column, e.g. `#thanks`) displayed as `<kbd>` badges in both the QuickReplyList and EditorToolbar dropdown. These are **display-only labels** — there is no global keyboard binding that triggers a specific quick reply. The user assigns a shortcut string when creating/editing the template for visual identification only.

To insert a quick reply via keyboard, the user must:
1. Open the quick reply dropdown (click the button or use navigation)
2. Click the desired item or rely on the shortcut badge for visual identification

Global keyboard shortcuts for quick replies are not currently implemented.
