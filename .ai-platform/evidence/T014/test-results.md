# T014 Test Results

## Targeted unsubscribe tests

Command:

```bash
npx vitest run src/services/unsubscribe/unsubscribeManager.test.ts
```

Result:

- Passed.
- 1 test file passed.
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

## Full frontend test suite

Command:

```bash
npm run test
```

Result:

- Passed.
- 135 test files passed.
- 1575 tests passed.

## Artifact validation

Command:

```bash
python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T014
```

Result:

- Passed.
- Lightweight delivery artifacts validation passed.
