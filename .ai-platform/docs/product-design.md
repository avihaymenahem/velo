# Kirje 产品设计合同

## 元数据

- 版本：0.1
- 状态：Ready_For_User_Review
- 来源：用户在 Codex 线程中的产品方向，以及本地 Velo 代码库约束。
- 最后更新：2026-05-31
- 审核闸门：需要用户明确批准后，才能进入功能实现规划。

## 产品定位

Kirje 是 Agentic Inbox：一个 local-first 桌面邮箱工作台，把邮件线程变成带状态、判断、记忆和可控 Agent 协助的工作对象。

Kirje 不应变成普通邮箱加 AI 按钮、泛任务管理器或邮箱旁边的聊天机器人。它的一阶价值是让用户更快、更安全地处理承诺、等待、决策、关系和沟通跟进。

## 目标用户

- 创始人。
- 投资人。
- 高管。
- 产品负责人。
- 销售负责人。
- 独立开发者。
- AI-native 团队。
- 管理高密度沟通和高价值关系的人。

## 用户故事与场景

- US-001：作为高邮件负载用户，我希望收件箱直接显示什么需要处理，而不是自己扫未读邮件。
- US-002：作为决策者，我希望线程在打开前或打开时暴露所需决策、风险和下一步动作。
- US-003：作为关系负责人，我希望 Kirje 自动追踪谁在等我，以及我在等谁。
- US-004：作为隐私敏感用户，我希望所有 AI 建议和动作都可审计、可本地控制。
- US-005：作为快捷键优先用户，我希望通过命令和快捷键处理邮件，而不是被视觉噪音干扰。

## 核心用户旅程

1. 用户打开 Kirje。
2. 收件箱显示工作状态、优先级、等待、承诺和建议动作。
3. 用户通过快捷键和命令菜单 triage 线程。
4. 打开线程时看到 briefing：摘要、关系上下文、风险、承诺、等待状态和建议下一步。
5. Agent 准备低风险草稿、提醒、归档建议和可审核动作。
6. 用户批准、编辑、拒绝或委托动作。
7. 完成的线程带明确状态和审计记录离开 inbox。

## 功能需求

- FR-001：维护阶段必须保留 Velo 现有账户、同步、搜索、标签、composer、calendar、tasks 和 AI provider 功能。
- FR-002：功能变更前先建立 governed maintenance workflow。
- FR-003：跟踪上游 Velo 变更和 open PR，并对采纳/拒绝/暂缓给出明确理由。
- FR-004：建立 TypeScript、前端测试、Rust 测试和 Rust build 的验证基线。
- FR-005：维护基线清楚后再添加 i18n；首批目标语言为英文和简体中文。
- FR-006：CLI 是未来 Agentic Inbox 操作层，不是当前要实现的完整终端邮箱客户端。
- FR-007：未来 Agent 功能必须映射到 Observe、Suggest、Prepare 或 Act。
- FR-008：未来 Act 级能力涉及高风险邮件、数据、记忆和自动化动作时，必须人工确认。

## 非功能需求

- NFR-001：保留 local-first 隐私方向，避免未经批准的云端处理。
- NFR-002：保持 TypeScript strict 兼容。
- NFR-003：UI 必须高密度、低噪音、快捷键优先、视觉克制。
- NFR-004：除非 approved technical decision 明确要求，否则避免大重写。
- NFR-005：每个中高风险变更都必须有验证证据。
- NFR-006：依赖更新必须评估安全、兼容性和产品风险。

## 功能范围

初始维护范围：

- 上游跟踪。
- 治理 artifacts。
- PR intake。
- 验证基线。
- 后续维护和产品任务图。

近期产品范围：

- 上游 PR 评估和选择性采纳。
- 质量基线修复。
- i18n foundation。
- Agentic Inbox 数据模型和第一批 UI slice。

## 非目标

- 不立即实现 CLI。
- 不立即做完整 UI redesign。
- 不批量合并上游 PR。
- 不自动发送邮件。
- 不做 cloud-first memory 或 telemetry。
- 不把产品直接改成泛任务管理器或 CRM。

## 边界情况

- 上游 PR 可能技术上有用，但与 Kirje 产品方向冲突。
- 现有 Velo 测试或 build 可能在 Kirje 变更前已经失败。
- AI 相关 PR 可能引入不可信 autonomy 或 UI 噪音。
- i18n 会暴露布局问题；这有价值，但不应在 foundation 阶段触发大规模 redesign。
- 本地 workspace 可能有用户自有 agent 文件，不能覆盖。

## 约束与假设

- 仓库根目录：`/Users/iiwish/self/kirje`。
- 基础项目：`avihaymenahem/velo` 的 fork。
- 当前分支策略：Codex 主导分支使用 `codex/`。
- 用户在 Codex 准备和验证后审核变更。
- 项目 artifacts 使用中文；代码标识符保持英文。
- 当前未跟踪的 `.agents/` 和 `AGENTS.md` 视为用户/项目自有文件。

## 数据与集成需求

- GitHub 上游 Velo main 和 PR metadata。
- 本地 Node、TypeScript、Vitest、Cargo 和 Tauri-adjacent Rust build 验证命令。
- 未来 i18n 需要翻译框架和稳定 key taxonomy。
- 未来 Agentic Inbox 需要本地表或服务支持 thread work state、commitments、waiting、agent actions 和 context memory。

## 成功指标

- SC-001：Kirje 有明确的 upstream tracking，且未合并未审核上游代码。
- SC-002：open upstream PR 被按优先级和下一步动作分类。
- SC-003：基线验证命令记录了 pass/fail/blocked 状态。
- SC-004：维护原则已写入可审核文档。
- SC-005：下一步工作被拆成有 scope 和 validation expectations 的任务。

## 验收标准

- AC-001：`upstream` remote 指向 `https://github.com/avihaymenahem/velo.git`。
- AC-002：当前 Kirje 分支与 upstream main 的关系已记录。
- AC-003：`.ai-platform/` 下存在可审核治理 artifacts。
- AC-004：`docs/upstream-pr-intake.md` 存在上游 PR intake。
- AC-005：`.ai-platform/docs/release-report.md` 记录验证 evidence。
- AC-006：Stage 0 不修改业务代码。

## 澄清记录

- 2026-05-31：用户确认 Codex 接管项目维护，用户负责审核。
- 2026-05-31：用户批准执行 Stage 0 maintenance foundation。
- 2026-05-31：用户询问是否应先同步原始项目。结论：本地 `main` 和 upstream `main` 都在 `ec47a7a`，Stage 0 不需要 merge。

## 开放问题

- `.agents/` 和 `AGENTS.md` 是否应作为 Kirje maintenance 项目文件提交？
- Stage 1 PR intake 应作为一个分支完成，还是每个上游 PR candidate 单独开分支？
- Kirje 是否应该在产品功能前先重命名 package/app identifiers，还是等 release packaging 规划时再处理？
