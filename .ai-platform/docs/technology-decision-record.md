# Kirje 技术决策记录

## 元数据

- 版本：0.2
- 状态：Ready_For_User_Review
- 最后更新：2026-06-02
- 审核闸门：需要用户明确批准后，才能成为 confirmed maintenance plan。

## 决策摘要

### TDR-001：跟踪上游，但不盲目合并

决策：添加 `upstream` remote 并 fetch upstream `main`；open PR 放入 intake 文档逐个评估。

理由：Kirje 应该吸收 Velo 的维护成果，但不能继承未经审核的产品方向、AI autonomy、安全改动或依赖 churn。

影响：

- 可以定期比较 upstream `main`。
- open PR 按风险和价值分类。
- 没有 Kirje task 和验证 evidence 的上游 PR 不合并。

### TDR-002：功能工作前先建立治理

决策：使用 `.ai-platform/` 作为 constitution、product contract、technical decisions、task graph 和 release evidence 的 SSOT。

理由：项目涉及邮箱、凭据、本地数据、AI 和用户沟通。没有闸门的 vibe coding 风险过高。

影响：

- 中高风险工作需要 approved spec 或 task plan。
- 用户 approval gate 必须明确。
- 未来 agent 可以从 artifacts 接手，而不是依赖聊天记忆。

### TDR-003：Stage 0 不改业务代码

决策：Stage 0 只做 remotes、branch setup、governance artifacts、PR intake 和 validation evidence。

理由：改变行为前，先知道继承的基线是什么。

影响：

- 业务代码保持不变。
- validation failure 会被记录，而不是被机会主义修复掩盖。

### TDR-004：CLI 是未来操作层

决策：maintenance foundation 不实现 CLI。CLI 记录为 Follow-up Assistant 核心对象稳定后的未来 operation surface。

理由：CLI 只有在线程工作状态、Agent Action、Commitment、Waiting 和 Draft workflow 稳定后才会强。

影响：

- Stage 0 和 Stage 1 不写 CLI 代码。
- 未来 CLI 应暴露 triage/review/commitment/waiting 流程，而不是重做完整终端邮箱客户端。

### TDR-005：i18n 在质量基线之后

决策：先完成 baseline validation 和上游 i18n PR 评估，再规划 i18n。

理由：i18n 值得早做，但需要稳定 key taxonomy 和质量基线，不能一上来做翻译运动。

影响：

- 选择实现细节前先评估 PR #202 和 #249。
- Kirje 首批目标语言仍是英文和简体中文。

### TDR-006：Velo 是 patch source，不是 product source

决策：Kirje 持续跟踪 Velo，但把 Velo 视为上游 patch source，而不是产品路线来源。

理由：Kirje 和 Velo 的产品目标会逐步分叉。Velo 的底层修复、兼容性修复和安全修复仍有价值，但 Velo 的 UI、AI 面板、普通邮箱功能扩张不应自动进入 Kirje。

影响：

- 定期 fetch upstream，但不默认 merge upstream `main`。
- 安全、协议、同步、认证、数据库、依赖和平台修复优先评估。
- 产品层变更默认 adapt/reject，而不是 adopt。
- 上游同步需要独立记录 adopt/adapt/reject/defer 决策。

### TDR-007：产品定位收敛为邮件跟进助手

决策：Kirje 的外部定位和近期产品主线从 Agentic Inbox 收敛为 local-first follow-up assistant for email。

理由：Agentic Inbox 是内部对象和能力方向，但对用户不够具体，容易把 Kirje 拉回泛 AI 邮箱或 Superhuman 平替。邮件跟进助手直接对应用户愿意迁移的高价值问题：我该回什么、别人没回什么、什么快到期。

影响：

- 对外文案优先使用 Follow-up Assistant、Needs Reply、Waiting、Due Soon。
- `Agentic`、`AgentAction`、`Commitment` 等术语保留为内部数据层和开发命名，不作为第一屏定位。
- T024 范围应收敛为 Today / Needs Reply / Waiting / Due Soon shell，不再一次性实现 Command Inbox、Commitments、Decisions、Agent Review 和 Smart Archive。

## 宪章检查

- 产品聚焦：满足。Stage 0 在功能工作前保护邮件跟进助手方向。
- 架构保留：满足。没有业务代码变更。
- 隐私/安全：满足。安全相关 PR 被优先 review，但不会盲目合并。
- AI 自主边界：满足。AI panel PR 在证明 product fit 前标记为风险。
- 测试/验证：部分满足。Node install、TypeScript 和 Vitest 通过；Rust 验证被 crates.io/index 访问和缺少离线缓存阻塞。
- Git/review：满足。工作在 `codex/maintenance-foundation`，artifacts 需要用户审核。
- 上游策略：满足。已明确 Velo 是 patch source，不是 product source。

## 考虑过的替代方案

- 先合并所有上游 open PR：拒绝。产品、安全、依赖和冲突风险过高。
- 先做 i18n 实现：Stage 0 拒绝。需要先建立基线和评估 PR。
- 先做 CLI prototype：拒绝。产品对象还不稳定。
- 忽略上游并立即分叉：拒绝。不应丢掉有价值修复和安全 patch。
- 长期机械 merge upstream `main`：拒绝。会把 Kirje 的产品方向交给 Velo。
- 完全放弃上游跟随：拒绝。会错过安全、协议和平台修复。

## 风险

- R-001：验证基线可能因继承代码或本地环境不完整而失败。
- R-002：PR ref fetch 可能因 GitHub/network 行为变慢或失败。
- R-003：治理 artifacts 如果不绑定真实执行，可能变成流程表演。
- R-004：未跟踪 `.agents/` 文件需要单独判断 ownership。

## 缓解措施

- M-001：如实记录验证失败；Stage 0 不私自修复。
- M-002：PR refs fetch 不可靠时，使用 GitHub API 生成 PR intake。
- M-003：保持任务小、可验证、evidence-driven。
- M-004：Stage 0 不修改 `.agents/` 或 `AGENTS.md`。

## 支撑文档

- `.ai-platform/memory/constitution.md`
- `.ai-platform/docs/product-design.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `docs/upstream-pr-intake.md`

## 对任务的影响

- Stage 1 应从 PR evaluation 开始，而不是功能实现。
- Stage 2 应在 Stage 0 记录失败后修复质量基线。
- i18n 和 Follow-up Assistant 需要单独 spec 后才能实现。
- 上游同步必须按 `docs/upstream-sync-policy.md` 执行。
