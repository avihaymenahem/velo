# T013 Test Results

## Failing regression before implementation

Command:

```bash
npx vitest run src/services/db/pendingOperations.test.ts
```

Result before fix:

- Failed as expected.
- New test `uses a bound parameter for the optional account filter` failed.
- Received SQL contained the malicious account id inline.

## Targeted test after implementation

Command:

```bash
npx vitest run src/services/db/pendingOperations.test.ts
```

Result:

- Passed.
- 1 test file passed.
- 21 tests passed.

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
- 134 test files passed.
- 1565 tests passed.

## Artifact validation

Command:

```bash
python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T013
```

Result:

- Passed.
- Lightweight delivery artifacts validation passed.
