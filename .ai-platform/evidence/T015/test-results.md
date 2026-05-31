# T015 Test Results

## First Rust test run

Command:

```bash
cd src-tauri && cargo test --locked
```

Result before final fix:

- Failed as expected.
- `rejects_extra_url_components` caught explicit `:443` being allowed because URL parsing normalizes the default HTTPS port.

## Rust tests after implementation

Command:

```bash
cd src-tauri && cargo test --locked
```

Result:

- Passed.
- 11 Rust tests passed.

## Rust build

Command:

```bash
cd src-tauri && cargo build --locked
```

Result:

- Passed.

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

## Formatting note

Command:

```bash
cd src-tauri && cargo fmt --check
```

Result:

- Failed due existing unrelated Rust formatting drift across multiple files.
- Full `cargo fmt` was not run to avoid unrelated churn.

## Artifact validation

Command:

```bash
python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T015
```

Result:

- Passed.
- Lightweight delivery artifacts validation passed.
