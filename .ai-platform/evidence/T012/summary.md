# T012 Evidence Summary

## 任务

适配上游 PR #206：修复 migration 14 被错误标记为 applied、但 `labels.imap_folder_path` 缺失的问题。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：这是数据库 migration repair，属于高风险用户数据路径；当前环境未启用 worker，且用户已明确要求继续 Stage 1B。
- 策略：不 cherry-pick 上游 PR；按 Kirje 的数据安全标准改造。

## 变更摘要

- `src/services/db/migrations.ts`
  - 在读取 `_migrations` 后增加 v14 repair。
  - 当 v14 已应用但 `labels.imap_folder_path` 缺失时，只删除 `_migrations` 中 version 14 的记录。
  - 不删除 version >= 14，避免重放 v20/v21 的 IMAP attachment / folder sync state 清理逻辑。

- `src/services/db/migrations-repair.test.ts`
  - 新增 migration repair regression tests。
  - 覆盖缺失列触发 repair、列存在不 repair、v14 未应用不 repair、partial v14 schema 重跑并容忍 duplicate column 的路径。

- `docs/upstream-pr-reviews.md`
  - 将 #206 结论更新为 `adapted`。
  - 记录与上游 PR 的差异和剩余风险。

- `.ai-platform/docs/tasks.md`
  - 新增 T012 task。

- `.ai-platform/docs/release-report.md`
  - 增加 Stage 1B 验证结果。

## 与上游 PR #206 的关键差异

上游 PR 采用删除 `_migrations WHERE version >= 14` 的方式，让 v14 及之后所有 migrations 重跑。Kirje 不采用该方式，因为当前后续 migration 中包含 IMAP resync 相关数据清理，作为 schema repair 过重。

Kirje 版本只删除 v14 migration record，利用现有 migration runner 对 duplicate column 的容忍能力，恢复已知缺失列，同时降低对用户本地数据的影响面。

## 残余风险

- Repair 条件只检查已知故障列 `labels.imap_folder_path`。如果 v14 的其他关键列缺失但该列存在，当前 repair 不会触发。
- 如果后续发现更多 v14 partial schema 形态，应升级为完整 v14 schema health check，而不是继续增加零散单列判断。
