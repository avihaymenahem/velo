# T022 Evidence Summary

## 任务

Stage 3B Agentic Object Model 与数据计划。

## 状态

Needs_Review。

## 交付内容

- 新增 `docs/agentic-object-model.md`。
- 更新 `.ai-platform/docs/tasks.md`，将 T021 标记为 Accepted，将 T022 推进到 Needs_Review。
- 更新 `.ai-platform/docs/release-report.md`，记录 Stage 3B 数据计划。

## 核心结论

- 不应把 Agentic work state 直接写入 `threads` 表。
- 不应复用 `tasks` 承载所有 Commitment / Waiting / Decision。
- 第一批新增对象应是 `thread_work_states`、`agent_actions`、`commitments`、`waiting_items`、`decisions`、`briefing_snapshots`。
- `AgentAction` 是信任系统核心，必须有统一 lifecycle 和风险边界。
- T023 应先实现手动可控 Thread Work State v0，不做 AI 自动分类。

## 残余风险

- T022 只做文档和数据计划，不修改运行时代码。
- schema 仍需在 T023 通过 migration tests 和 DB service tests 验证。
- Agent Action executor 不能在 T023 扩大范围，否则会过早触碰发送、归档、删除等高风险路径。
