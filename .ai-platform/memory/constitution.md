# Kirje 项目宪章

## 元数据

- 版本：0.2
- 状态：Ready_For_User_Review
- 最后更新：2026-06-02
- 审核闸门：需要用户明确批准后，才能成为项目的阻塞性原则。

## 目的

Kirje 是基于 Velo 演进的 local-first 邮件跟进助手。项目目标不是普通邮箱加 AI 按钮，而是帮助用户盯住多个邮箱里“我该回什么、别人没回什么、什么快到期”，并在本地、可审计、可控制的边界内逐步引入 Agent 协助。

本宪章定义 Kirje 在维护、产品方向、工程质量和 AI 自主能力上的不可协商原则。

## 原则

### 产品聚焦

- Kirje 不是泛 AI 邮箱，也不是 Superhuman 平替；Kirje 是邮件跟进助手。
- 核心问题是：我该回什么、谁还没回我、什么快到期、哪些线程已经完成。
- 每个功能必须降低回复、跟进、截止日期、关系维护、信息检索或承诺管理成本。
- 如果一个功能只是“看起来智能”，但不能明显减少处理成本，应拒绝。

### 架构

- 保留 Velo 现有的 Tauri v2、React、TypeScript、Rust、SQLite、Gmail API 和 IMAP/SMTP 架构，除非某个已批准任务明确要求改变。
- 优先增量演进，不轻易重写。
- 业务逻辑应保持在 `src/services/`；组件不应在已有服务抽象存在时直接调用 Gmail、IMAP、SMTP 或数据库底层。
- 邮件修改操作应优先使用已有的 offline-aware action layer。
- 数据库 schema 变更必须追加 migration，不修改旧 migration，并需要 migration 测试或 smoke evidence。

### Local-First 与隐私

- Local-first 存储和隐私是核心约束。
- API key、OAuth token、IMAP 凭据、联系人记忆、Agent 记忆和邮件正文都属于高风险数据。
- Agent 功能必须可审计、尽可能可撤销、可配置。
- 未经明确批准，不添加远程遥测、云同步、模型调用或外部处理。

### AI 自主边界

- Agent 能力分为 Observe、Suggest、Prepare、Act。
- Observe/Suggest/Prepare 可以逐步构建。
- Act 涉及发送邮件、删除邮件、批量归档、创建承诺、修改规则、更新长期记忆、处理财务/法律/敏感关系内容时，必须获得用户明确授权。
- AI 聊天不是产品本体。Agent 能力必须嵌入线程、Follow-up 队列、搜索、联系人、草稿、等待、承诺和审核队列等流程。

### UX 与交互

- Kirje 应该高密度、低噪音、快捷键优先、冷静、专业。
- Linear-like 指清晰的信息架构、快速命令流和精确状态，而不是暗色模式、毛玻璃、大卡片或装饰渐变。
- 每天使用 4 小时以上的舒适度比视觉新奇更重要。
- 每个有意义的邮件线程都应该走向明确的工作状态。

### 测试与验证

- 必须尊重 TypeScript strict mode。
- 行为变更默认 TDD，除非任务记录了用户批准的例外。
- 高风险路径需要针对性验证：OAuth、token refresh、IMAP/SMTP、发送、删除、归档、同步、离线队列、migration、加密和 AI actions。
- 验证证据必须来自真实命令结果。跳过或失败的验证必须明确说明。

### 依赖与上游策略

- Velo 是 Kirje 的 upstream patch source，不是 Kirje 的产品路线来源。
- 可以跟踪上游 Velo `main`，但不得长期机械 merge upstream。
- 上游安全修复、协议兼容、Tauri/Rust/依赖修复和平台兼容性修复应持续评估吸收。
- 上游产品功能、AI 体验、信息架构和 UI 方向必须按 Kirje 的邮件跟进助手原则重新判断。
- PR 按产品契合度、安全影响、实现质量、测试证据和冲突风险评估。
- 不批量合并 dependabot 更新。安全相关依赖更新优先。
- AI panel/sidebar 类 PR 默认视为产品风险，除非证明它服务 Needs Reply、Waiting、Due Soon 或可审核跟进流程，而不是扩张聊天侧栏。
- 默认优先 cherry-pick 或改造具体 commit/PR slice；只有当上游 `main` 的差异清楚、低风险且符合 Kirje 方向时，才考虑 merge。

### Git 与审核策略

- Codex 主导的工作使用 `codex/` 分支前缀。
- 未经明确批准，不改写共享历史。
- 不覆盖用户变更或无关未跟踪文件。
- 中高风险工作在 acceptance 前必须有 SSOT artifact、任务边界、验证命令和 evidence。
- 用户负责审核与接受；Codex 可以准备、实现和验证，但不能从沉默推断 approval。

## 变更流程

- 修改本宪章需要单独变更，并由用户明确批准。
- Feature spec 和 task plan 必须列出任何与宪章冲突的地方。
- 宪章冲突是阻塞性问题，除非用户批准特定例外。

## 例外

- 紧急修复只有在用户明确批准时，才可以绕过完整 governed delivery。
- 任何例外都必须记录 scope、原因、验证和 residual risk。
