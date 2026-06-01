# Kirje Release Readiness

## 直接判断

Kirje 现在仍然不能公开发布。

Stage 2C 已经完成发布身份迁移，但 Stage 2D 的目标不是“发一个包试试”，而是把 release 前置条件变成可重复检查：

- GitHub release workflows 仍必须由 `KIRJE_RELEASES_ENABLED` 控制。
- Updater signing key 必须是 Kirje 自有 keypair。
- 私钥只能进入 GitHub Secrets，不能进入仓库。
- Homebrew tap 必须存在并使用独立 token。
- macOS 公共 release 必须走签名和 notarization。

## 检查命令

```bash
npm run release:readiness
```

当前该命令预期失败，因为 release 仍被冻结。失败表示“不能发布”，不是代码质量失败。

## 必须满足的条件

### GitHub Variables

- `KIRJE_RELEASES_ENABLED=true`

只有在所有下列条件完成后才允许设置为 `true`。

### GitHub Secrets

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `HOMEBREW_TAP_TOKEN`
- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

### Updater Signing

生成 Kirje 自有 updater keypair：

```bash
npx tauri signer generate --write-keys ~/.tauri/kirje-updater.key
```

规则：

- 私钥内容写入 `TAURI_SIGNING_PRIVATE_KEY`。
- 私钥密码写入 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- public key 写入 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。
- 不提交私钥文件。

### Homebrew

- 创建 `iiwish/homebrew-kirje`。
- 创建只允许写入该 tap 的 token。
- 将 token 写入 `HOMEBREW_TAP_TOKEN`。

## 发布顺序

1. 配置 updater signing key 和 secrets。
2. 创建 Homebrew tap 和 token。
3. 配置 Apple signing / notarization secrets。
4. 更新 `src-tauri/tauri.conf.json` 中的 updater public key。
5. 运行 `npm run release:readiness`，必须通过。
6. 设置 `KIRJE_RELEASES_ENABLED=true`。
7. 先做 draft release 或受控 release dry run。
8. 验证 release assets、`latest.json`、Homebrew cask、安装和更新路径。

## 不做项

- 不把 `KIRJE_RELEASES_ENABLED` 当成普通 CI 开关。
- 不发布 unsigned public macOS build。
- 不把 updater endpoint 迁到 `kirje.app`，直到官网有签名、缓存、回滚和可观测性策略。
- 不在 release readiness PR 里做 i18n、CLI 或 UI 功能。
