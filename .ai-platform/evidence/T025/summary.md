# T025 Thread Briefing v0 Evidence

## Scope

Implemented a read-only Thread Briefing v0:

- Added a structured briefing prompt that treats email content as untrusted literal content.
- Added `generateThreadBriefing` with `briefing` AI cache support.
- Upgraded the existing `ThreadSummary` surface to show structured briefing sections.
- Added English and Simplified Chinese briefing labels and failure copy.
- Fixed briefing availability checks when messages load after the first render.
- Guarded against stale briefing responses overwriting the current thread after a fast thread switch.
- Kept AI output read-only; it does not create commitments, waiting items, decisions, tasks, labels, or thread work states.

## Changed Files

- `src/services/ai/prompts.ts`
- `src/services/ai/aiService.ts`
- `src/services/ai/aiService.test.ts`
- `src/components/email/ThreadSummary.tsx`
- `src/components/email/ThreadSummary.test.tsx`
- `src/components/i18nResidual.test.tsx`
- `src/i18n/locales/en/email.json`
- `src/i18n/locales/zh-CN/email.json`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`

## Review Notes

- Briefing v0 is a read model only.
- The prompt explicitly forbids creating durable user state.
- Non-JSON model output falls back to a summary-only briefing instead of crashing the UI.
- Generation failure shows a non-blocking state and leaves the original messages visible.
- Briefing generation now waits for at least two messages before marking AI availability as checked.
- Slow responses from a previous thread are ignored after the user switches threads.

## Residual Risk

- Briefing quality depends on the configured AI provider and model.
- The UI has component test coverage but no desktop screenshot evidence yet.
- Cache invalidation is manual refresh only; message-change-sensitive invalidation is deferred.
