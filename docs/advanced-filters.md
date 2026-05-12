# Advanced Filter Engine

## Overview

The advanced filter engine lets users define fine-grained email filtering rules beyond simple substring matching. It supports multi-condition logic with AND/OR combinators, regex matching, and is fully backward compatible with the legacy flat-criteria (`criteria_json`) approach.

Filters are evaluated automatically during sync (`applyFiltersToMessages` in `filterEngine.ts`) across all enabled rules for a given account. Each rule matched triggers a set of actions: apply label, archive, star, mark read, or trash.

---

## Filter Operators

| Operator | Constant | Description | Example |
|---|---|---|---|
| Contains | `contains` | Case-insensitive substring match | `from contains "@company.com"` |
| Matches regex | `matches` | JavaScript `RegExp` test (case-insensitive, `i` flag auto-applied) | `subject matches "invoice-\d+"` |
| Starts with | `starts_with` | Case-insensitive prefix match | `subject starts_with "URGENT"` |
| Ends with | `ends_with` | Case-insensitive suffix match | `from ends_with "@example.com"` |
| Does not contain | `not_contains` | Negated case-insensitive substring | `subject not_contains "spam"` |

`FilterOperator` type definition: `'contains' | 'matches' | 'starts_with' | 'ends_with' | 'not_contains'`

---

## Condition Model

Each condition is a `FilterCondition` object stored in the `filter_conditions` table:

```typescript
interface FilterCondition {
  id: string;          // UUID
  filterId: string;    // FK → filter_rules.id
  field: FilterField;  // "from" | "to" | "subject" | "body" | "hasAttachment"
  operator: FilterOperator;
  value: string;
}
```

**Field values** mapped from `ParsedMessage`:

| Field | Source |
|---|---|
| `from` | `fromName + " " + fromAddress` |
| `to` | `toAddresses` (comma-separated string) |
| `subject` | `subject` |
| `body` | `bodyText + " " + bodyHtml` |
| `hasAttachment` | Boolean; value compared against `"true"` / `"1"` |

---

## AND/OR Logic

Conditions are combined using the `group_operator` column on `filter_rules`, which stores either `"AND"` or `"OR"`. When omitted, defaults to `"AND"`.

- **AND**: All conditions must pass (`conditions.every(c => c.passed)`)
- **OR**: Any condition must pass (`conditions.some(c => c.passed)`)

The UI shows AND/OR toggle buttons (only when more than one condition exists) in `FilterEditor.tsx:274-297`. The selected mode is persisted both in `group_operator` (DB column) and in `criteria_json` under `matchType`.

Legacy fallback: if no `filter_conditions` rows exist, the engine falls back to the flat `criteria_json` fields (`from`, `to`, `subject`, `body`, `hasAttachment`) with implicit AND logic.

---

## Regex Validation

The `matches` operator supports JavaScript regex patterns. Invalid regex is handled gracefully:

1. **Engine** (`filterEngine.ts:54-63`): `new RegExp` is wrapped in try/catch — invalid patterns silently return no match (`passed: false`).
2. **UI** (`FilterEditor.tsx:33-41`): A live `isValidRegex()` check validates the pattern. A green checkmark (`Check`) or red X (`X`) icon is rendered inside the input field at `FilterEditor.tsx:331-338`.

---

## Filter Test Debugger

`FilterTestDialog` provides per-condition pass/fail debugging for any filter rule against a real stored message.

**How it works** (`filterTester.ts`):

1. User selects a rule and a message (from the 50 most recent).
2. `testFilterOnMessage(ruleId, messageId)` loads the rule, conditions, and full message from DB.
3. Each condition is evaluated individually via `evaluateCondition()`.
4. Returns `FilterTestResult`:

```typescript
interface FilterTestResult {
  conditions: ConditionDebugResult[];  // per-condition: field, operator, value, passed, matchedText
  overall: boolean;                     // combined via group_operator
}
```

**UI** (`FilterTestDialog.tsx:97-148`):
- Overall PASS/FAIL banner (green/red with icons)
- Per-condition rows showing: field, operator, value, matched text (on pass), pass/fail icon
- Matched text displays the actual substring or regex capture that triggered the condition

---

## Migration v33

```sql
CREATE TABLE IF NOT EXISTS filter_conditions (
  id TEXT PRIMARY KEY,
  filter_id TEXT NOT NULL REFERENCES filter_rules(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'contains',
  value TEXT NOT NULL
);

ALTER TABLE filter_rules ADD COLUMN group_operator TEXT NOT NULL DEFAULT 'AND';
```

Cascade delete: removing a filter rule automatically deletes its conditions.

---

## File Map

| File | Purpose |
|---|---|
| `src/services/filters/filterEngine.ts` | Core matching: `evaluateCondition()`, `evaluateConditionsAnd/Or`, `evaluateFilterRule()`, `messageMatchesFilter()`, `applyFiltersToMessages()`, `computeFilterActions()` |
| `src/services/filters/filterTester.ts` | Debug API: `testFilterOnMessage()`, types `FilterTestResult`, `ConditionDebugResult` |
| `src/services/db/filters.ts` | DB queries: CRUD for filter rules, conditions, groups; types `FilterCondition`, `FilterCriteria`, `FilterActions`, `DbFilterRule`, `FilterOperator`, `FilterField` |
| `src/services/db/migrations.ts` | Schema migration v33: `filter_conditions` table + `group_operator` column |
| `src/components/settings/FilterEditor.tsx` | Filter CRUD UI: condition rows, AND/OR toggle, regex validation indicator, label/action selectors |
| `src/components/settings/FilterTestDialog.tsx` | Debug dialog: message picker, per-condition results with matched text, overall pass/fail |

---

## Example

**Goal**: Incoming invoices from `@company.com` are labeled "Invoices" and archived (skip inbox).

**Configuration in FilterEditor**:

| Setting | Value |
|---|---|
| Name | `Company Invoices` |
| Condition 1 | `from` `contains` `@company.com` |
| Condition 2 | `subject` `matches` `invoice-\d+` |
| Match type | **AND** |
| Action | Apply label → `Invoices` |
| Action | Archive ✓ |

**Result**: When a message arrives where `fromAddress` contains `@company.com` AND `subject` matches `/invoice-\d+/i`, the engine calls `addThreadLabel(accountId, threadId, "Invoices")` and `removeThreadLabel(accountId, threadId, "INBOX")`.
