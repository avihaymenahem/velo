# T019 Test Results

## Failing tests before implementation

```bash
npx vitest run src/config/tauriConfig.test.ts src/utils/crypto.test.ts src/components/ui/UpdateToast.test.tsx src/services/calendar/icalHelper.test.ts
```

结果：失败。关键失败点：

- `tauri.conf.json` 返回 `Velo`，期望 `Kirje`。
- crypto 仍访问 `velo.key`，期望 `kirje.key`。
- UpdateToast 仍显示 `Velo v...`，期望 `Kirje v...`。
- Calendar PRODID 仍为 `Velo Mail`，期望 `Kirje`。

## Passing targeted tests after implementation

```bash
npx vitest run src/config/tauriConfig.test.ts src/utils/crypto.test.ts src/components/ui/UpdateToast.test.tsx src/services/calendar/icalHelper.test.ts
```

结果：通过。4 files，47 tests。

## Broader validation

```bash
npx tsc --noEmit
```

结果：通过。

```bash
npm audit --audit-level=moderate
```

结果：通过，0 vulnerabilities。

```bash
npm run test
```

结果：通过。135 files，1580 tests。

```bash
cd src-tauri && cargo test --locked
```

结果：通过。11 Rust tests。

```bash
cd src-tauri && cargo build --locked
```

结果：通过。

```bash
git diff --check
```

结果：通过。

```bash
rg -n "\\bVelo\\b|velomail|avihaymenahem|com\\.velomail|velo\\.db|velo\\.key|homebrew-velo|com\\.velomail\\.app" package.json package-lock.json src-tauri .github release-please-config.json app.kirje.Kirje.yml app.kirje.Kirje.desktop app.kirje.Kirje.metainfo.xml kirje.spec README.md docs/development.md docs/architecture.md docs/keyboard-shortcuts.md src AGENTS.md -S --glob '!src-tauri/target'
```

结果：无高风险发布/运行时 Velo identity 命中。内部 `velo-*` event names 仍保留，但不属于本次扫描的 release identity 范围。

## Artifact validation

```bash
python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T019
```

结果：通过。
