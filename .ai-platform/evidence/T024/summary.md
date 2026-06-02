# T024 Follow-up Queues Shell Evidence

## Scope

Implemented the first Follow-up Assistant shell:

- Sidebar Follow-up group with Today, Needs Reply, Waiting, and Due Soon.
- `/mail/$label` routing for follow-up views.
- EmailList query paths for follow-up views.
- DB service queries for work-state queues, due-soon queues, and Today aggregation.
- English and Simplified Chinese labels and empty states.
- Sidebar regression coverage for follow-up ordering and navigation.

## Changed Files

- `src/constants/followUpViews.ts`
- `src/router/navigate.ts`
- `src/router/navigate.test.ts`
- `src/services/db/threadWorkStates.ts`
- `src/services/db/threadWorkStates.test.ts`
- `src/components/layout/Sidebar.test.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/EmailList.tsx`
- `src/i18n/locales/en/sidebar.json`
- `src/i18n/locales/zh-CN/sidebar.json`
- `src/i18n/locales/en/email.json`
- `src/i18n/locales/zh-CN/email.json`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`

## Review Notes

- T024 intentionally does not implement automatic AI work-state inference.
- Due Soon v0 uses `thread_work_states.due_at` and linked incomplete tasks due within 14 days.
- Today v0 aggregates Needs Reply, Waiting, and Due Soon signals with simple ranking.
- Agent Review, Smart Archive, Decisions, and full Command Inbox remain out of MVP scope.

## Residual Risk

- Browser visual smoke test through plain Vite is not a reliable acceptance path for this Tauri app. The page enters an expected error boundary outside the Tauri runtime because SQL/window IPC APIs are unavailable.
- The UI compiles and tests pass, but desktop visual screenshot evidence should be captured in the Tauri runtime before accepting a polished UI milestone.
