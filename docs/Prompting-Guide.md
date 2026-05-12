# Velo Prompting Guide — Replan + Parallel Agent Workflow

> **Version**: 2.1 (May 2026)
> **Goal**: Use the new replan approach from docs/future.md, run agents in parallel, and finish features cleanly by leaning on @build, @plan, and subagents.
> **Stack**: Tauri + React 19 + TypeScript + Rust + SQLite

---

## Table of Contents

1. [Why This Guide](#why-this-guide)
2. [The Three Core Elements](#the-three-core-elements)
3. [Agent Selection](#agent-selection)
4. [Parallel Workflow Patterns](#parallel-workflow-patterns)
5. [Prompt Templates](#prompt-templates)
6. [Using Subagents Effectively](#using-subagents-effectively)
7. [Finish-Perfectly Rules](#finish-perfectly-rules)
8. [Anti-Patterns](#anti-patterns)

---

## Why This Guide

This guide is the new source of truth for Velo work in 2026. It is built around:
- the fresh replan in docs/future.md,
- efficient parallel agent execution, and
- using every available project asset to ship complete, high-quality work.

Use this guide whenever you want to:
- design a phased feature roadmap,
- break work into parallel agent tasks,
- coordinate code, docs, tests, and validation.

---

## The Three Core Elements

1. **Replan from the future roadmap**
   - Treat docs/future.md as the strategic plan.
   - Break large work into phases and scope each phase clearly.
   - Reuse existing architecture and avoid reinventing the core local-first model.

2. **Parallelize with agents**
   - Use @plan for architecture and high-level sequencing.
   - Use @build for concrete code work.
   - Use subagents for exploration, research, tests, and QA in parallel.

3. **Use everything available**
   - Existing docs: docs/architecture.md, docs/development.md, docs/keyboard-shortcuts.md.
   - Source patterns: service layer, stores, Tauri commands, tests.
   - Built-in tools: versioned schemas, existing db services, background checkers.

---

## Agent Selection

### Available Subagent Types

When using the `task` tool, these are the available `subagent_type` values and what they map to:

| Subagent Type | Alias | Best For |
|--------------|-------|----------|
| `general` | @build | Backend services, DB logic, business logic, TypeScript tests, migration files |
| `frontend-ui-ux` | @build | React components, Tailwind CSS, TipTap extensions, Zustand stores, UI tests |
| `backend-tauri` | @build | Rust modules (IMAP, SMTP, PGP, vault, export), Tauri commands, Cargo.toml |
| `lead-architect` | @plan | Architecture planning, roadmap sequencing, phase dependency analysis |
| `docs-curator` | @docs | Writing/updating docs in docs/, markdown files, changelogs |
| `explore` | @explore | Reading files, mapping code structure, finding patterns, impact analysis |

### Subagent Strategy

Use subagents when a task can be split into independent parts:
- `general` + `frontend-ui-ux` → implement backend service + frontend UI in parallel
- `backend-tauri` + `frontend-ui-ux` → Rust backend + React UI in parallel
- `general` + `docs-curator` → implement feature + write docs simultaneously
- `explore` before `general` → research patterns before implementing

### Example: Full Phase Dispatch

```
Parallel dispatch for a feature that touches all layers:
  1. general → DB migration + service layer + business logic
  2. frontend-ui-ux → React components + Tailwind UI
  3. backend-tauri → Rust commands + Cargo deps (if applicable)
  4. docs-curator → documentation + i18n keys
```

### Switching Agents

- Use `Tab` in the TUI to rotate primary agents.
- Use `@agent-name` to target a specific agent directly.
- Use `/switch agent-name` to change the main workflow.

---

## Parallel Workflow Patterns

### Pattern 1: Replan and Scope First

Prompt:

```
@plan Replan the next Velo feature phase using docs/future.md.

Context:
- Existing app architecture: Tauri + React + SQLite
- Current roadmap focuses on i18n, contact intelligence, campaigns, workflow automation, privacy
- Need a phased implementation plan with dependencies and phase boundaries

Please produce:
1. Phase breakdown with priorities
2. Required schema additions
3. Service and component impact map
4. Validation checkpoints
5. Parallel subagent roles for implementation, tests, and docs
```

Why:
- Ensures the work is aligned to the new future plan.
- Makes the implementation path explicit before coding.

### Pattern 2: Implement in Parallel

Prompt:

```
@build Implement [FEATURE NAME] using the existing Velo service patterns.

Context:
- The project already has email sync, AI, filters, tasks, and queues
- Use the codebase's existing provider abstraction and database services
- Aim for incremental, test-covered changes

Please produce:
1. File list to modify/create
2. Minimal schema changes
3. Tests to add
4. Validation steps after implementation
```

Why:
- Keeps the work grounded in Velo's current architecture.
- Forces build prompts to include tests and validation.

### Pattern 3: Explore and Confirm

Prompt:

```
@explore Find the Velo implementation for [feature area].

Please report:
1. Key files and services involved
2. Existing patterns to reuse
3. Risk areas or similar past implementations
4. Relevant tests or docs to update
```

Why:
- Prevents guesswork.
- Helps build agents reuse existing code patterns.

### Pattern 4: Research and Validate

Prompt:

```
@scout Research the best approach for [technical choice] in a Tauri + React local-first app.

Please compare:
- Options in terms of architecture fit
- Impact on security and offline behavior
- Compatibility with existing Velo services
- Recommended choice with justification
```

Why:
- Ensures technical decisions are evidence-based.
- Keeps the project from drifting toward unsupported designs.

---

## Prompt Templates

### Replan Prompt

```
@plan Replan the Velo roadmap for the next 2-3 phases.

Context:
- Current future doc in docs/future.md
- Need to preserve local-first design, SQLite services, and Tauri Rust integration
- Goal: ship incremental value with low risk

Output:
1. Phase summary
2. Dependencies by phase
3. Parallel subtask breakdown for build, explore, test, docs
4. Acceptance criteria for each phase
```

### Build Prompt

```
@build Add [feature] to Velo.

Context:
- Use current Velo architecture and existing patterns
- Keep changes small and incremental
- Include unit/integration tests

Deliverables:
- Code changes in specific files
- Database schema updates if needed
- Tests and validation instructions
```

### Explore Prompt

```
@explore Locate the implementation of [feature] in the Velo repo.

Please return:
- Relevant file paths
- Existing service/components to reuse
- Similar code patterns or helpers
- Any tests already covering this area
```

### QA Prompt

```
@qa-guardian Review the changes for [feature].

Focus:
- Architecture consistency
- Security and data handling
- Test coverage and edge cases
- Documentation completeness

Return:
- Issues found
- Severity
- Fix suggestions
```

### Docs Prompt

```
@docs-curator Update the Velo docs for [feature].

Please produce:
- Updated guide section or new doc page
- Summary of user-facing behavior
- Notes for developers on implementation and architecture
```

---

## Using Subagents Effectively

### When to split work

- If a feature touches UI, backend, and database, run `@build`, `@explore`, and `@qa-guardian` in parallel.
- If you need a design decision, use `@plan` and `@scout` together.
- If the repo search is needed before implementation, start with `@explore` before `@build`.

### Example parallel flow

1. `@plan` defines phases and architecture.
2. `@explore` maps current code and service patterns.
3. `@build` implements the feature.
4. `@qa-guardian` reviews the changes.
5. `@docs-curator` updates guides.

This flow keeps work synchronized and avoids late surprises.

---

## Finish-Perfectly Rules

1. Always include tests in the initial prompt.
2. Always reference existing docs and code patterns.
3. Always validate with the appropriate agent:
   - `@qa-guardian` for review,
   - `@scout` for choice validation,
   - `@explore` for code mapping.
4. Always keep changes small and incremental.
5. Always update docs when behavior changes.

---

## Anti-Patterns

- Asking for large changes without a plan.
- Starting with `@build` before understanding the codebase.
- Ignoring existing project docs and architecture notes.
- Using only one agent for multi-layer work.
- Skipping tests or validation steps.
