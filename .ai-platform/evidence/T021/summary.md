# T021 Evidence Summary

## 任务

Stage 3A 产品表面审计与信息架构。

## 状态

Needs_Review。

## 交付内容

- 新增 `docs/product-surface-audit.md`。
- 新增 `docs/agentic-inbox-ia.md`。
- 更新 `.ai-platform/docs/tasks.md`，新增 Epic E3 和 T021-T027。
- 更新 `.ai-platform/docs/release-report.md`，记录 Stage 3A 结论。

## 核心结论

- Kirje 应继续基于 Velo 增量演进，不应重写。
- 当前最大缺口不是 UI 审美，而是缺少线程工作状态、Agent Action 审核对象和 Thread Briefing。
- 第一批产品改造必须围绕 `ThreadWorkState`、`AgentAction`、`Commitment`、`Waiting`、`Decision`、`BriefingSnapshot`。
- CLI 和 i18n 都不应进入当前核心路径。CLI 依赖稳定操作对象，i18n 依赖稳定 IA 和术语。

## 残余风险

- Stage 3A 只做文档和任务图，不修改运行时代码。
- 后续如果跳过 T022 数据计划直接做 UI，会导致 Agentic Inbox 变成表层导航改造。
- Agent Action 若不统一进入审核队列，AI 功能会继续分散在组件中，难以建立用户信任。
