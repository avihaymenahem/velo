# T018 Evidence Summary

## 任务

Stage 2B：Kirje release identity migration 审计与计划。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：发布身份、updater、signing、bundle id、本地数据文件都属于高风险 release/data surface。
- 策略：只做审计和迁移计划，不直接改 app identity。

## 输入

- 用户确认进入 Stage 2B。
- 官网域名：`kirje.app`。
- 本地仓库：`/Users/iiwish/self/kirje`。
- PR #1 已创建用于 Stage 1 maintenance foundation CI。

## 变更摘要

- 新增 `docs/release-identity-migration.md`。
  - 分类 Kirje/Velo 发布身份冲突。
  - 给出建议身份契约。
  - 明确 `kirje.app` 在官网、release notes、安全数据、updater 中的阶段性角色。
  - 拆分 R001 到 R006 后续实现任务。

- 更新 `.ai-platform/docs/tasks.md`。
  - 新增 T018 Stage 2B 任务。

- 更新 `.ai-platform/docs/release-report.md`。
  - 记录 Stage 2B 审计结果和下一步 gate。

## 审计结果

- 全仓 `Velo|velo|velomail|avihaymenahem|com.velomail` 引用约 443 处。
- 关键发布/运行时/文档身份引用约 138 处。
- 发现的高风险身份面包括：
  - Tauri productName / identifier / updater endpoint。
  - Windows AUMID。
  - package/Cargo name。
  - Homebrew tap/cask。
  - Flatpak/RPM/metainfo/desktop files。
  - `velo.db` / `velo.key` 本地数据身份。

## 残余风险

- 尚未确认 Kirje updater signing key 和 GitHub release secrets。
- 尚未确认是否需要迁移用户本机已有 `velo.db` / `velo.key`。
- 尚未确认 Homebrew tap 是 `iiwish/homebrew-kirje` 还是未来组织账号。
- `app.kirje.desktop` 是当前推荐 identifier，实施前仍需用户确认。
