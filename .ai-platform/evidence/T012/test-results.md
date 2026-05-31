# T012 Test Results

## Targeted migration tests

Command:

```bash
npx vitest run src/services/db/migrations-repair.test.ts src/services/db/migrations.test.ts
```

Result:

- Passed.
- 2 test files passed.
- 10 tests passed.

## TypeScript

Command:

```bash
npx tsc --noEmit
```

Result:

- Passed.

## npm audit

Command:

```bash
npm audit --audit-level=moderate
```

Result:

- Passed.
- 0 vulnerabilities.

## Rust tests

Command:

```bash
cd src-tauri && cargo test --locked
```

Result:

- Passed.
- 6 tests passed.

## Rust build

Command:

```bash
cd src-tauri && cargo build --locked
```

Result:

- Passed.

## Full frontend test suite

Command:

```bash
npm run test
```

Result:

- Passed.
- 134 test files passed.
- 1564 tests passed.

## Artifact validation

Command:

```bash
python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T012
```

Result:

- Passed.
- Lightweight delivery artifacts validation passed.
