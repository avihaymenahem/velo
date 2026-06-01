# T020 Test Results

## Release readiness script

```bash
node scripts/release-readiness.mjs
```

结果：失败，符合预期。当前仓库仍缺少 signing/secrets/Homebrew tap，release 不可启用。

摘要：

- Kirje Tauri identity：通过。
- Kirje SQLite preload：通过。
- Kirje updater endpoint：通过。
- Updater public key：失败，仍是继承值。
- Required secrets：失败，当前未配置。
- Homebrew tap：失败，`iiwish/homebrew-kirje` 不存在。
- `KIRJE_RELEASES_ENABLED`：缺失，release workflows 保持冻结。

```bash
npm run release:readiness
```

结果：失败，符合预期。11 个 blockers。

## Regression validation

```bash
npm run test
```

结果：通过。135 files，1580 tests。

```bash
git diff --check
```

结果：通过。
