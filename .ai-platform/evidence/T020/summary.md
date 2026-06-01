# T020 Evidence Summary

## 任务

Stage 2D：Release readiness gate。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：release enable、updater signing、GitHub secrets、Homebrew tap 和 notarization 都是高风险发布面。
- 本任务不启用 release，不生成私钥，不写 GitHub Secrets。

## 变更摘要

- 新增 `scripts/release-readiness.mjs`：
  - 检查 Tauri Kirje identity。
  - 检查 updater endpoint。
  - 检查 updater public key 是否仍是继承值。
  - 检查 required GitHub Secrets 是否配置。
  - 检查 `iiwish/homebrew-kirje` 是否存在。
  - 输出 `KIRJE_RELEASES_ENABLED` 当前状态。
- 新增 `npm run release:readiness`。
- 新增中文 runbook：`docs/release-readiness.md`。
- 更新 release report、release audit、identity migration 和 task graph。

## 当前远端状态

- `gh variable list --repo iiwish/kirje`：无 variables。
- `gh secret list --repo iiwish/kirje`：无 secrets。
- `gh release list --repo iiwish/kirje --limit 10`：无 releases。
- `gh repo view iiwish/homebrew-kirje`：仓库不存在。

## 当前 readiness 结果

当前 `npm run release:readiness` 预期失败，列出 11 个 blockers：

- Updater public key 仍是继承值。
- `TAURI_SIGNING_PRIVATE_KEY` 未配置。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 未配置。
- `HOMEBREW_TAP_TOKEN` 未配置。
- Apple signing / notarization secrets 未配置。
- `iiwish/homebrew-kirje` 不存在。

`KIRJE_RELEASES_ENABLED` 当前缺失，因此 release workflows 保持冻结。

## 残余风险

- 该 gate 不能验证 secret 内容是否正确，只能验证 secret 名称存在。
- updater keypair 必须由人工在本地生成，并把 private key 写入 GitHub Secrets；不得提交到仓库。
- Homebrew token 的权限范围需要人工在 GitHub 侧确认。
- Apple notarization 的有效性只能通过受控 draft release 验证。
