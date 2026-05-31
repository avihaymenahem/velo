# T013 Evidence Summary

## 任务

适配上游 PR #245-A：将 `compactQueue(accountId)` 的 account filter 从 SQL 字符串插值改为绑定参数。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：这是 offline queue DB service 的安全修复，风险高但 scope 很小。
- 策略：只采纳 #245 的 SQL 参数化 slice，不触碰 HTTP capability、OAuth、unsubscribe 或 credential recovery。

## 变更摘要

- `src/services/db/pendingOperations.ts`
  - `compactQueue(accountId)` 现在使用 `account_id = $1` 和 `[accountId]` 绑定参数。
  - 无 `accountId` 时仍查询全部 pending operations。

- `src/services/db/pendingOperations.test.ts`
  - 新增 SQL injection regression test。
  - 断言恶意 `accountId` 不进入 SQL 文本，只作为绑定参数传递。

- `docs/upstream-pr-reviews.md`
  - 将 #245-A 标记为已适配，并保留 #245-C/#245-D/#245-E/#245-F 后续决策。

- `.ai-platform/docs/tasks.md`
  - 新增 T013 task。

- `.ai-platform/docs/release-report.md`
  - 记录 #245-A 验证结果。

## TDD 证据

新增 regression test 后，旧实现失败：

- 旧 SQL：`AND account_id = 'acct-1' OR status = 'pending'`
- 失败原因：测试期望 `account_id = $1` 且 params 为恶意 accountId。

修复后目标测试、TypeScript、npm audit 和完整 Vitest suite 均通过。

## 残余风险

- 本任务只修复 `compactQueue(accountId)` 的 SQL interpolation。
- PR #245 的其他安全 slice 尚未实现，不能宣称 Kirje 已完成 #245 的整体 security hardening。
