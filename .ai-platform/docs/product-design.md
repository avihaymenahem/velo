# Kirje 产品设计合同

## 元数据

- 版本：0.2
- 状态：Ready_For_User_Review
- 来源：用户在 Codex 线程中的产品方向，以及本地 Velo 代码库约束。
- 最后更新：2026-06-02
- 审核闸门：需要用户明确批准后，才能进入功能实现规划。

## 产品定位

Kirje 是本地优先的邮件跟进助手：它帮助用户盯住多个邮箱里“我该回什么、别人没回什么、什么快到期”，并把邮件线程变成可追踪、可确认、可完成的工作事项。

Kirje 不应变成普通邮箱加 AI 按钮、泛任务管理器、CRM 或邮箱旁边的聊天机器人。它的一阶价值是让用户不用每天清空收件箱，也不会漏掉需要回复、需要跟进或快到期的邮件事项。

## 目标用户

- 独立开发者、freelancer、顾问和小型创始人。
- 有 2-5 个邮箱、跨工作/个人/平台账号处理邮件的人。
- 邮件不一定高频，但一漏会损失钱、机会、关系或时间的人。
- 跨境工作者、创作者、研究者、申请者、远程工作者和小型 agency。
- 隐私敏感、愿意 local-first 和 BYOK AI，而不是把邮箱交给另一个云平台的人。

## 用户故事与场景

- US-001：作为多邮箱用户，我希望打开 Kirje 后先看到今天该回、该跟、快到期的事，而不是先扫所有未读。
- US-002：作为独立工作者，我希望 Kirje 帮我追踪我发出去但对方还没回的线程。
- US-003：作为轻度但高后果邮件用户，我希望账单、续费、申请、合同、会议或材料截止日期能被提出，而不是埋在收件箱里。
- US-004：作为隐私敏感用户，我希望所有 AI 建议都可解释、可确认、可本地控制。
- US-005：作为快捷键优先用户，我希望通过命令和快捷键标记 Needs Reply、Waiting、Due、Done，而不是被视觉噪音干扰。

## 核心用户旅程

1. 用户连接一个或多个邮箱。
2. Kirje 同步邮件，并把线程映射到待回复、等待对方、快到期或已完成等状态。
3. 用户打开 Kirje，第一屏看到 Today / Needs Reply / Waiting / Due Soon，而不是传统 inbox。
4. 用户确认、编辑或忽略候选事项；确认后的事项进入本地追踪。
5. 打开线程时看到 briefing：对方要什么、我是否该回、我在等谁、有什么截止日期、来源证据和建议下一步。
6. 用户回复、设置提醒、标记 Waiting / Done，或让 AI 准备草稿。
7. 完成的线程带明确状态和审计记录离开跟进队列。

## 信息模型决策

Kirje 不新增一套独立的邮件标签体系作为近期主线。原因是邮箱世界已经有 Gmail labels、IMAP folders、本地 labels、smart labels 和 smart folders；再做一套 `Kirje tags` 会增加迁移成本、同步困惑和产品噪音。

近期信息模型只保留三层：

- Action State：用户下一步该怎么处理，服务 Today / Needs Reply / Waiting / Due Soon / Done。
- Context Label：这封邮件属于什么上下文，复用 provider labels、IMAP folders、自定义 labels、smart labels 和 smart folders。
- Signal：系统检测到的证据或提示，例如 attachment、receipt、invoice、travel、meeting、deadline、newsletter、no-reply、security warning。Signal 可以影响队列和 briefing，但默认不变成用户手工管理的标签。

产品规则：Work State != Label；Label != Signal。Follow-up 队列应该由 Action State 和少量可信 Signal 驱动，不把标签系统做成第一版差异化。

## 功能需求

- FR-001：维护阶段必须保留 Velo 现有账户、同步、搜索、标签、composer、calendar、tasks 和 AI provider 功能。
- FR-002：功能变更前先建立 governed maintenance workflow。
- FR-003：跟踪上游 Velo 变更和 open PR，并对采纳/拒绝/暂缓给出明确理由。
- FR-004：建立 TypeScript、前端测试、Rust 测试和 Rust build 的验证基线。
- FR-005：维护基线清楚后再添加 i18n；首批目标语言为英文和简体中文。
- FR-006：CLI 是未来 Follow-up 操作层，不是当前要实现的完整终端邮箱客户端。
- FR-007：未来 Agent 功能必须映射到 Observe、Suggest、Prepare 或 Act。
- FR-008：未来 Act 级能力涉及高风险邮件、数据、记忆和自动化动作时，必须人工确认。
- FR-009：近期产品主线必须优先落地 Today、Needs Reply、Waiting、Due Soon 和手动确认闭环。

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
- Follow-up Assistant 数据模型、队列壳、Thread Briefing 和第一批 UI slice。

## 非目标

- 不立即实现 CLI。
- 不立即做完整 UI redesign。
- 不批量合并上游 PR。
- 不自动发送邮件。
- 不做 cloud-first memory 或 telemetry。
- 不把产品直接改成泛任务管理器或 CRM。
- 不把 Agentic Inbox、AI chat、Agent Review Queue 或 Smart Archive 作为第一屏主叙事。

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
- 未来 Follow-up Assistant 需要本地表或服务支持 thread work state、commitments、waiting、due items、agent actions 和 context memory。

## 成功指标

- SC-001：用户连接真实邮箱后，能在 15 秒内理解 Today / Needs Reply / Waiting / Due Soon 的用途。
- SC-002：用户能手动确认至少 3 个邮件事项，并在 7 天内回到 Waiting 或 Due Soon 查看状态。
- SC-003：Kirje 至少帮用户发现 1 个原本可能漏掉的回复、跟进或截止日期。
- SC-004：AI 或规则建议必须显示来源证据，用户能确认、编辑或忽略。
- SC-005：基础邮箱能力继续稳定：账户、同步、搜索、标签、composer、calendar、tasks 和 AI provider 不被跟进主线破坏。
- SC-006：上游同步仍按 patch source 策略执行，未合并未审核上游代码。

## 验收标准

- AC-001：公开 README 与 SSOT 文档使用“local-first follow-up assistant for email / 本地优先的邮件跟进助手”定位。
- AC-002：下一阶段任务图优先 Today、Needs Reply、Waiting、Due Soon，而不是完整 Agentic Inbox 或功能堆叠。
- AC-003：Agentic / AgentAction / Commitment 等词保留为内部对象层，不作为第一屏用户定位。
- AC-004：`.ai-platform/` 下存在可审核治理 artifacts，且后续中高风险工作仍有 scope、validation 和 evidence。
- AC-005：文档不承诺尚未实现的自动 Due Soon 或自动 AI 执行动作。

## 澄清记录

- 2026-05-31：用户确认 Codex 接管项目维护，用户负责审核。
- 2026-05-31：用户批准执行 Stage 0 maintenance foundation。
- 2026-05-31：用户询问是否应先同步原始项目。结论：本地 `main` 和 upstream `main` 都在 `ec47a7a`，Stage 0 不需要 merge。
- 2026-06-02：用户确认产品定位收敛为“本地优先的邮件跟进助手”，优先解决我该回什么、别人没回什么、什么快到期。

## 开放问题

- `.agents/` 和 `AGENTS.md` 是否应作为 Kirje maintenance 项目文件提交？
- Stage 1 PR intake 应作为一个分支完成，还是每个上游 PR candidate 单独开分支？
- Kirje 是否应该在产品功能前先重命名 package/app identifiers，还是等 release packaging 规划时再处理？
