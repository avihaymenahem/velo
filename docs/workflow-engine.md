# Workflow Engine

## Database Schema (Migration v26)

```sql
workflow_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,          -- email_received|no_reply_after_days|time_based
  trigger_conditions TEXT,              -- JSON: {from_domain, subject_contains, cron}
  actions TEXT NOT NULL,                -- JSON array of action objects
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
)
```

## Trigger Types

| Trigger | Description | Conditions |
|---------|-------------|------------|
| `email_received` | Fires on incoming email | `from_domain`, `subject_contains`, `from_address` |
| `no_reply_after_days` | Thread with no reply after N days | `days` |
| `time_based` | Cron-scheduled execution | `cron` (5-field cron expression) |

## Action Types

```ts
type WorkflowAction =
  | { type: "apply_label"; labelId: string }
  | { type: "send_template"; templateId: string; delayHours?: number }
  | { type: "create_task"; title: string; dueDays?: number }
  | { type: "mark_read" }
  | { type: "archive" }
  | { type: "star" }
  | { type: "forward_to"; email: string };
```

Actions execute synchronously in order within `evaluateAndExecute()`. `send_template`, `forward_to`, and `create_task` are defined but not yet wired to backend execution.

## Workflow Engine Service

Located in `src/services/workflows/`:

| File | Purpose |
|------|---------|
| `workflowEngine.ts` | Rule evaluation, condition matching, action dispatch |
| `workflowScheduler.ts` | 60s interval checker for `time_based` rules |

```ts
evaluateWorkflowRules(accountId, event, context)  // called during sync
evaluateAndExecute(rule, context)                  // single rule eval
matchesConditions(rule, context)                   // condition check
parseWorkflowActions(actionsJson)                  // JSON → WorkflowAction[]
```

## Workflow Scheduler

`startWorkflowScheduler()` (60s interval) polls `workflow_rules` for active `time_based` rules, parses their cron conditions, and executes matching rules. Uses a simple cron parser supporting minute, hour, and day-of-week fields.

```ts
"0 9 * * 1"  // every Monday at 9:00
"30 8 * * *" // every day at 8:30
"0 * * * *"  // every hour at :00
```

Returns a cleanup function to stop the scheduler.

## Pre-built Workflow Presets

10 presets in `src/constants/workflowPresets.ts`:

| Preset | Trigger | Action(s) |
|--------|---------|-----------|
| Auto-archive newsletters | `email_received` + subject contains "newsletter" | archive |
| Star VIP emails | `email_received` + from domain | star |
| Flag invoices | `email_received` + subject contains "invoice" | apply_label + star |
| Auto-reply on vacation | `email_received` | send_template |
| Follow-up after 3 days | `no_reply_after_days` (3) | create_task |
| Forward support tickets | `email_received` + subject "support" | forward_to |
| Weekly digest reminder | `time_based` (Mon 9am) | create_task |
| Archive social notifications | `email_received` + from linkedin.com | archive + mark_read |
| Flag overdue replies | `no_reply_after_days` (7) | create_task + star |
| Mark read mailing lists | `email_received` + subject "unsubscribe" | mark_read |

## Workflow UI

All workflow components live in `src/components/settings/`:

| Component | Purpose |
|-----------|---------|
| `WorkflowEditor` | Main rule list, form, preset browser |
| `WorkflowRuleCard` | Rule display with toggle/edit/delete |
| `WorkflowTriggerPicker` | Trigger event + conditions form |
| `WorkflowActionPicker` | Multi-action builder (add/remove/reorder) |
| `WorkflowPresetList` | Grid of 10 presets with Apply Preset button |

Rules are listed under Settings → Workflows (`activeTab === "workflows"`).
