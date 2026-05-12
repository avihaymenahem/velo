# Advanced Template Library

Organised email templates with categories, variables, conditional blocks, slash commands, sharing, and usage analytics.

---

## 1. Overview

The Advanced Template Library extends the basic template system with five capabilities:

- **Categories** — organise templates into named groups (system + custom) with icons
- **Template Variables v2** — 11 dynamic variables resolved at insert time per recipient
- **Conditional Blocks** — `{{#if var}}...{{else}}...{{/if}}` evaluated per-recipient
- **Quick-Insert** — EditorToolbar button (`Ctrl+Shift+T`) and slash command (`/template`)
- **Sharing** — export/import templates as standalone JSON files

---

## 2. Template Categories

### Schema (`DbTemplateCategory`)

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | UUID |
| `account_id` | `TEXT?` | FK → accounts; NULL = global |
| `name` | `TEXT` | Display name |
| `icon` | `TEXT?` | Emoji string (e.g. `"💰"`, `"🎧"`) |
| `sort_order` | `INTEGER` | Display order (default 0) |
| `is_system` | `INTEGER` | 1 = system category (non-deletable) |

### System Categories

Five pre-defined system categories with assigned icons:

| Name | Icon | Deletable |
|------|------|-----------|
| Sales | 💰 | No |
| Support | 🎧 | No |
| Legal | ⚖️ | No |
| Marketing | 📣 | No |
| Internal | 🏢 | No |

### Custom Categories

Users create arbitrary categories via the TemplateManager settings or inline from the TemplatePicker modal. Custom categories are deletable (orphaned templates have their `category_id` set to NULL).

### Source

- `src/services/db/templates.ts` — `getCategories()`, `upsertCategory()`, `deleteCategory()`
- Migration v29 — `template_categories` table

---

## 3. Template Variables v2

Two variable-resolution systems exist:

### Campaign Variables (`src/services/campaigns/templateVariables.ts`)

Used by the composer preview and campaign mail-merge. Resolved via `resolveCampaignVariables()` with a `CampaignVariableSource` contact lookup.

| Variable | Source | Example |
|----------|--------|---------|
| `{{email}}` | Contact email | `jane@acme.com` |
| `{{first_name}}` | First word of display name | `Jane` |
| `{{company}}` | Email domain (first segment) | `acme` |
| `{{display_name}}` | Contact display_name | `Jane Smith` |
| `{{my_name}}` | Account display_name | `Alice Johnson` |
| `{{my_title}}` | Setting `my_title` or `accounts.my_title` | `CEO` |
| `{{my_phone}}` | Setting `my_phone` or `accounts.my_phone` | `+1-555-0100` |
| `{{date}}` | Today, long month + day + year | `May 12, 2026` |
| `{{date_long}}` | Today, weekday + full date | `Tuesday, May 12, 2026` |
| `{{day_of_week}}` | Today, weekday only | `Tuesday` |
| `{{random_greeting}}` | Random from locale-aware pool | `Hello`, `Hi`, `Hey`, `Greetings` |

Locale pool supports: `en`, `fr`, `de`, `es`, `zh`, `ja`, `ar`, `pt`, `it`, `nl`. Falls back to English.

### General Variables (`src/utils/templateVariables.ts`)

Used outside campaigns (e.g., inline template interpolation in the editor). Synchronous `interpolateVariablesSync()` and async `interpolateVariables()` with contact DB resolution.

| Variable | Description |
|----------|-------------|
| `{{first_name}}` | Recipient first name |
| `{{last_name}}` | Recipient last name |
| `{{email}}` | Recipient email |
| `{{my_name}}` | Sender name |
| `{{my_email}}` | Sender email |
| `{{subject}}` | Thread subject |
| `{{date}}` | Today (Month Day, Year) |
| `{{day}}` | Day of week |

---

## 4. Conditional Blocks

Syntax in template body HTML:

```
{{#if first_name}}
  Hi {{first_name}},
{{else}}
  Hello there,
{{/if}}
```

### Evaluation

`evaluateConditionalBlocks(template, vars)` in `src/services/campaigns/templateVariables.ts`:

1. Matches `/\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g`
2. If `vars[varName]` is truthy and non-empty → renders the `if` block
3. Otherwise → renders the `else` block (or empty)

Blocks can be nested within variable templates and are stored in `templates.conditional_blocks_json`.

---

## 5. TemplatePicker UI

`src/components/composer/TemplatePicker.tsx`

A modal dialog (`520px` wide) opened from the EditorToolbar or `Ctrl+Shift+T`.

### Layout

1. **Search bar** — fuzzy search across `name`, `body_html`, `subject` via `fuzzyMatch()` (character-sequence matching)
2. **Category tabs ribbon** — horizontal scrollable pill buttons: `All | Sales | Support | Legal | Marketing | Internal | <custom...> | +`
3. **Template list** — sections for **Favorites** (starred), **Most Used** (top 5), and all templates filtered by active category
4. **Template card** — name, subject, body preview (120 chars stripped), usage count badge, category badge
5. **Footer** — `Ctrl+Shift+T` keyboard hint

### Inline Category Creation

A `+` button at the end of the category ribbon toggles an inline input field. Enter creates a new category via `upsertCategory()` and refreshes the list.

---

## 6. Slash Command

`src/components/composer/TemplateSlashExtension.ts`

A TipTap ProseMirror plugin that activates when the user types `/` followed by characters.

### Flow

1. User types `/` — captures text up to 100 chars before cursor via `/\/(\w*)$/`
2. On keydown listener debounced at 50ms — queries `getTemplatesForAccount(accountId)` and filters by name/subject match
3. If matches found → opens a floating dropdown (managed via plugin state: `{ open, query, templates, selectedIndex }`)
4. **Arrow keys** — navigate list (wraps around)
5. **Enter/Tab** — inserts selected template body at cursor position, deletes the `/query` text
6. **Escape** — closes dropdown

### Insertion

`insertTemplate(view, tmpl)` — deletes the `/<query>` range from the document and inserts `tmpl.body_html` via `insertText()`. Increments usage count asynchronously.

---

## 7. TemplateVariablePreview

`src/components/composer/TemplateVariablePreview.tsx`

An inline preview bar rendered at the bottom of the composer when a template with variables is inserted.

### Features

- **Contact selector** — dropdown of 10 most recent contacts to preview with
- **Resolves** all `{{variables}}` and `{{#if}}` blocks in the template HTML
- Uses fallback placeholder values (e.g. `John`, `Acme`, `CEO`, `+1-555-0100`) when no contact is selected
- Renders preview HTML via `dangerouslySetInnerHTML` in a `line-clamp-2` container
- Hidden when `templateHtml` is null

Positioned in a `border-t border-border-secondary bg-bg-secondary/50 px-3 py-2` bar with an eye icon and "Preview" label.

---

## 8. TemplateManager Settings

`src/components/settings/TemplateManager.tsx`

### Category Management

- **Expandable categories** — chevron toggle to show/hide templates within each category
- **Rename** — inline input, Enter to confirm, Escape to cancel
- **Delete** — only for non-system categories, orphans templates
- **System badge** — system categories show a `[System]` label

### Template CRUD

- **Create/Edit form** — fields for name, subject, category selector, TipTap editor with toolbar, shortcut, conditional blocks textarea
- **Preview mode** — toggles between TipTap editor and an iframe sandbox render with copy-HTML button
- **Save** — calls `insertTemplate()` or `updateTemplate()`

### Variable Insertion

A dropdown (`InsertVariableDropdown`) positioned below the editor lists available variables from `TEMPLATE_VARIABLES` constant. Clicking inserts the variable key at cursor via `editor.chain().focus().insertContent(variable).run()`.

### Import / Export

- **Export** — `exportTemplateToJson()` serialises `{ version, name, subject, body_html, shortcut, category_name, conditional_blocks_json }` → download as `{name}.json`
- **Import** — file picker → `importFromFile()` → `parseImportedTemplate()` validation → auto-creates matching category if needed → `insertTemplate()`

---

## 9. EditorToolbar Button

`src/components/composer/EditorToolbar.tsx`

A `<FileText size={12} />` icon button with label "Templates" and tooltip `Templates (Ctrl+Shift+T)`. Rendered conditionally when `onToggleTemplatePicker` is provided.

Positioned in the right side of the toolbar (after `flex-1` spacer), before the Quick Replies and AI Assist buttons. The `Ctrl+Shift+T` shortcut is handled at the App keyboard shortcut level (`src/constants/shortcuts.ts`).

---

## 10. Migration v29

File: `src/services/db/migrations.ts` (version 29)

New table:

```sql
CREATE TABLE IF NOT EXISTS template_categories (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_system INTEGER DEFAULT 0
);
CREATE INDEX idx_template_categories_account ON template_categories(account_id);
```

New columns on `templates`:

| Column | Type | Default |
|--------|------|---------|
| `category_id` | TEXT → FK template_categories(id) | NULL |
| `is_favorite` | INTEGER | 0 |
| `usage_count` | INTEGER | 0 |
| `last_used_at` | INTEGER | NULL |
| `conditional_blocks_json` | TEXT | NULL |

---

## 11. Template Sharing

`src/services/campaigns/templateShare.ts`

### Exported Template Format

```json
{
  "version": 1,
  "name": "Follow-up",
  "subject": "Checking in",
  "body_html": "<p>Hi {{first_name}}, ...</p>",
  "shortcut": "fu",
  "category_name": "Sales",
  "conditional_blocks_json": "..."
}
```

### API

| Function | Description |
|----------|-------------|
| `exportTemplateToJson(template)` | Serialises template + category name to formatted JSON string |
| `parseImportedTemplate(json)` | Validates and parses imported JSON, returns `ExportedTemplate \| null` |
| `importFromFile(file)` | Reads a `File` object via FileReader, calls `parseImportedTemplate()` |

### Import Flow (in TemplateManager)

1. User selects `.json` file
2. `importFromFile()` reads + validates
3. If `category_name` exists, finds or creates matching category via `upsertCategory()`
4. `insertTemplate()` creates the template with the resolved `categoryId`

---

## 12. File Map

| File | Purpose |
|------|---------|
| `src/services/db/templates.ts` | DB queries: CRUD templates & categories, favorites, most-used, usage tracking |
| `src/services/db/migrations.ts` | Schema migration v29 — categories table + template columns |
| `src/services/campaigns/templateVariables.ts` | Campaign variable resolution (`resolveCampaignVariables`) + conditional block evaluation |
| `src/services/campaigns/templateShare.ts` | JSON export/import (`exportTemplateToJson`, `parseImportedTemplate`, `importFromFile`) |
| `src/utils/templateVariables.ts` | General variable definitions (`TEMPLATE_VARIABLES`), sync/async interpolation |
| `src/components/composer/TemplatePicker.tsx` | TemplatePicker modal with category tabs, fuzzy search, favorites, inline category creation |
| `src/components/composer/TemplateSlashExtension.ts` | ProseMirror plugin for `/template` slash command with fuzzy dropdown |
| `src/components/composer/TemplateVariablePreview.tsx` | Inline preview bar resolving variables against a selected contact |
| `src/components/composer/EditorToolbar.tsx` | Toolbar button (`FileText`) wired to toggle TemplatePicker |
| `src/components/settings/TemplateManager.tsx` | Settings page: category CRUD, template editor, import/export, variable dropdown |
