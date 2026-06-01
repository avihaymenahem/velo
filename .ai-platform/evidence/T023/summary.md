# T023 Evidence Summary

## 任务

Stage 3C Thread Work State v0。

## 状态

Needs_Review。

## 交付内容

- 新增 Agentic Inbox 类型定义：`src/services/agentic/types.ts`。
- 新增 migration v24：Agentic work state、AgentAction、Commitment、Waiting、Decision、BriefingSnapshot 本地表。
- 新增 `src/services/db/threadWorkStates.ts` 和 tests。
- 新增 `src/services/db/agentActions.ts` 和 tests。
- `Thread` 增加可选 `workState` 字段。
- `EmailList` 批量加载当前可见线程的 work state。
- `ThreadCard` 显示紧凑 work-state chip。
- `CommandPalette` 支持手动设置 selected thread work state。
- 更新任务图和 release report。

## Test-first 记录

先写失败测试：

- `threadWorkStates.test.ts`：service 文件不存在。
- `agentActions.test.ts`：service 文件不存在。
- `migrations.test.ts`：v24 migration 不存在，`MIGRATIONS` 未导出。
- `ThreadCard.test.tsx`：Waiting chip 不存在。

失败后实现最小通过路径，并补充 `CommandPalette.test.tsx` 覆盖手动状态命令。

## 核心结论

- Thread work state 已成为独立本地对象层，没有污染 `threads` 表。
- Manual state 是优先级最高的用户控制状态，`agent_suggested` 不会覆盖它。
- AgentAction 只建立最小可审计 DB 层，尚未执行任何副作用。
- UI 只加入高密度 chip 和 command 操作，没有进入 Work Queues 或 AI 自动化。

## 残余风险

- v24 migration 还没有在真实用户数据库上运行过，只通过 migration/unit tests 和完整 Vitest。
- `agent_actions` 当前是最小 DB service，没有 approve/execute guard；这些应留给 T026。
- Command Palette 只支持 selected thread；多选批量 work state 不在 T023 范围。
- Work Queues 过滤和 Sidebar IA 尚未实现，应进入 T024。
