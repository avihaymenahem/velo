# Kirje 产品表面审计

## 元数据

- 阶段：Stage 3A
- 状态：Revised_For_Follow-up_Positioning
- 日期：2026-06-02
- 范围：现有 Velo/Kirje 产品表面、对象模型缺口、Follow-up Assistant 第一批改造边界

## 1. 直接判断

Kirje 值得继续基于 Velo 增量演进，不应该重写。

最大风险不是技术栈，而是产品表面仍然像“功能很全的邮箱客户端”：左侧是邮箱文件夹，中间是邮件列表，右侧是邮件阅读器，AI 分散成摘要、回复、搜索、任务提取几个能力点。这个形态可以做出好邮箱，但做不出足够锋利的邮件跟进助手。

应该收敛到一个判断：第一版 Follow-up Assistant 不追求更多 AI 功能，而是让用户先看到并确认 Today、Needs Reply、Waiting 和 Due Soon。Agentic 对象层继续存在，但它服务跟进闭环，不是对外定位。

暂时不要做：

- CLI。
- 大规模视觉 redesign。
- 自动发送邮件。
- 独立任务管理器。
- AI 聊天侧边栏作为主体验。

## 2. 产品本质

现有产品主要解决：

- 阅读：线程、阅读面板、附件、搜索、联系人上下文。
- 回复：Composer、smart replies、AI assist。
- 跟进：手动 follow-up reminder。
- 信息检索：搜索、Ask Inbox、smart folders。
- 分类：标签、分类、bundle、smart labels。

Kirje 目标产品必须进一步解决：

- 待回复：哪些线程需要我处理。
- 待跟进：谁欠我回复，等待多久了。
- 截止日期：哪些账单、申请、续费、合同、会议或材料快到期。
- 信任：建议来自哪封邮件、哪句话、哪个规则或 AI 推断。
- Agent 控制：哪些动作可以交给 Agent 准备，哪些必须我确认。

核心体验不是“更智能地读邮件”，而是把线程升级为可执行工作对象。

## 3. 现有资产

这些应该保留并复用。

| 资产 | 判断 | 原因 |
| --- | --- | --- |
| Tauri + React + TypeScript + Rust | 保留 | 桌面、系统集成、本地优先都符合 Kirje 方向。 |
| SQLite local-first 数据层 | 保留 | Agent 记忆、动作审计、离线队列都需要本地可信状态。 |
| Gmail API + IMAP/SMTP provider abstraction | 保留 | 多账户和开放协议是基础能力，不应重写。 |
| 三栏布局 | 保留并重构信息层级 | 已接近目标工作台结构，但内容层级仍是邮箱阅读器。 |
| 快捷键与 Command Palette | 保留并扩展 | 这是快速标记 Needs Reply / Waiting / Due / Done 的核心操作层。 |
| `emailActions.ts` 离线操作队列 | 保留并收敛调用路径 | Agent Act 未来必须走可审计、可重试、可撤销路径。 |
| `ai_cache` 与 AI provider manager | 保留 | 可作为 Agent observe/prepare 的缓存基础。 |
| tasks、follow-up、contact sidebar | 保留为基础材料 | 可以演进成 Commitment、Waiting、Relationship Memory。 |
| phishing/auth/link scan | 保留 | 高价值关系沟通场景需要信任与风险提示。 |

## 4. 核心缺口

### 缺口 1：没有 Thread Work State

当前 `Thread` 主要是邮件属性：已读、星标、置顶、静音、附件、标签、分类。它没有表达“需要我回复、等待对方、我有承诺、需要决策、有风险、可归档、已完成”。

没有这一层，UI 只能继续围绕 inbox/label/category 组织，Agent 也只能成为辅助组件。

### 缺口 2：没有 Agent Action 对象

现有 AI 能总结、回复、搜索、提取任务，但这些能力没有统一进入一个动作对象。用户无法稳定看到：

- Agent 建议了什么。
- 风险等级是什么。
- 基于哪些消息。
- 是否已确认。
- 是否已执行。
- 执行失败如何回滚或重试。

这会直接限制信任。

### 缺口 3：Thread Briefing 不存在

`ThreadSummary` 是摘要卡片，不是线程简报。线程简报应在用户阅读原文前回答：

- 为什么这封邮件重要。
- 对方要什么。
- 我之前承诺过什么。
- 谁在等谁。
- 有什么风险。
- 下一步建议是什么。

摘要只是材料，简报才是工作入口。

### 缺口 4：Sidebar 仍是邮箱导航，不是跟进队列

当前左侧以 Inbox、Starred、Snoozed、Sent、Drafts、Trash、分类、标签为主。这些是邮箱对象，不是工作状态。

第一屏应该优先出现：

- Today。
- Needs Reply。
- Waiting。
- Due Soon。

传统邮箱文件夹可以保留，但应降级。

### 缺口 5：Tasks 有变成普通任务管理器的风险

现有 Tasks 很完整，但 Kirje 不能复制 Todoist/Linear。邮件里的任务只应服务沟通承诺、跟进和决策推进。独立任务系统不是第一性目标。

### 缺口 6：AI 分散在组件里

`ThreadSummary`、`SmartReplySuggestions`、`AiAssistPanel`、`AskInbox`、任务提取、分类、smart labels 都有价值，但它们现在更像 AI 功能点，而不是统一 Agent 操作层。

## 5. 最强方案

第一阶段只做一个产品结构变化：把“邮件线程列表”改造成“邮件跟进雷达”。

### 页面结构

左侧：Follow-up 优先，Mailboxes 次级。

- Today。
- Needs Reply。
- Waiting。
- Due Soon。
- Mailboxes。
- Labels。
- Smart Folders。

中间：Thread List 高密度显示工作状态。

- sender / organization。
- subject。
- short briefing。
- work state chip。
- due / waiting age。
- relation priority。
- agent suggestion marker。
- risk marker。

右侧：Thread Briefing + Messages。

顶部先显示 Briefing：

- Latest ask。
- Why it matters。
- My commitments。
- Waiting status。
- Risks。
- Suggested next actions。
- Agent prepared draft/action。

然后才是原邮件正文。

后续独立页面：Agent Review Queue。

- 所有 Agent 建议动作集中审核。
- 支持 approve、edit、reject、snooze、convert to rule。
- 高风险动作必须逐条确认。

### 对象

第一批对象只做必要集合，其中 `ThreadWorkState`、`AgentAction`、`Commitment`、`Waiting`、`Decision` 和 `BriefingSnapshot` 是内部对象层，不是对外定位：

- `ThreadWorkState`
- `AgentAction`
- `Commitment`
- `Waiting`
- `Decision`
- `BriefingSnapshot`

`ContactMemory` 和 `OrganizationMemory` 先设计，不急着实现。

### 动作

必须支持：

- 标记为需要回复。
- 标记为等待对方。
- 设置或确认截止日期。
- 将线程设为完成。
- 从线程创建承诺。
- 从线程创建决策。
- 接受或拒绝 Agent 建议归档。
- 接受、编辑或拒绝 Agent 准备的草稿。

不要先做：

- 自动发送。
- 自动拒绝人。
- 自动承诺时间。
- 自动处理财务、法律、雇佣、投资相关内容。

## 6. Agent 设计

### Observe

Agent 可以观察：

- 最新邮件与历史线程。
- 发件人、组织、关系频次。
- 我方是否最后回复。
- 是否包含问题、请求、会议、付款、合同、招聘、投资、客户风险。
- 是否出现承诺语言、截止时间、等待信号。
- 认证、钓鱼、链接风险。

### Suggest

Agent 可以建议：

- 工作状态。
- 优先级。
- 是否需要回复。
- 是否可归档。
- 是否应等待对方。
- 是否创建 commitment / decision。
- 下一步动作。

### Prepare

Agent 可以准备：

- 线程简报。
- 回复草稿。
- 跟进邮件草稿。
- 承诺对象草案。
- Waiting / Decision 对象草案。
- 批量归档候选列表。

### Act

Agent 只能在用户授权后执行：

- 发送邮件。
- 归档。
- 删除。
- 设置提醒。
- 更新联系人记忆。
- 应用规则或 playbook。

必须人工确认：

- 发送任何外部邮件。
- 删除或永久删除。
- 代表用户做承诺。
- 拒绝、接受、报价、谈判。
- 财务、法律、招聘、投资、客户升级。
- 涉及敏感关系的语气或立场变化。

## 7. Linear 级交互要求

高密度：

- 线程列表不做大卡片。
- 状态 chip 短而稳定。
- 列表行高度可控，信息靠对齐和层级，不靠装饰。

低噪音：

- Agent 只在有明确 next action 时出现。
- 不做常驻聊天气泡。
- 不用“AI magic”营销文案。

快捷键友好：

- Follow-up queue 可用 `g` 序列跳转。
- 线程状态可用单键或 command 操作。
- Agent action 后续可快速 approve / edit / reject。
- 多选批量操作后续再支持 Smart Archive 和低风险建议。

状态清晰：

- 每个线程只能有一个主工作状态，可有多个辅助 flags。
- Agent 建议状态必须区分 `suggested`、`prepared`、`approved`、`executed`、`failed`。
- 风险等级必须可见。

视觉克制：

- 保留三栏，但减少 glass / decorative background 的存在感。
- 不做巨大 AI 面板。
- Briefing 是紧凑信息块，不是营销卡片。

## 8. 风险与砍掉项

### 应该砍掉或后置

- CLI：等对象模型和 Agent Action API 稳定后再做。否则 CLI 只是邮箱命令包装器，不会爆。
- AI 聊天侧边栏：可以保留 Ask Inbox，但不能成为主体验。
- 全量 CRM：联系人记忆只服务邮件决策，不做 Salesforce。
- 完整任务管理：任务只服务邮件承诺，不做 Linear 低配版。
- 自动发送：第一版会伤信任。
- Agent Review Queue、Smart Archive、Decisions 作为首屏导航：后置，避免 MVP 过宽。

### 技术债风险

- 部分邮件操作仍可能绕过 `emailActions.ts` 直接调用 provider/client，未来 Agent Act 必须统一走可审计队列。
- AI 输出目前缺少统一 schema 和动作生命周期。
- Thread 状态若直接散落在现有表字段，会很快失控，应单独建模。
- 关系记忆如果没有隐私边界，会变成敏感数据风险。

## 9. 下一步

Stage 3B/3C 已经完成对象模型和 Thread Work State v0。下一步不是继续扩 Agent，而是做 Stage 3D：Follow-up Queues Shell。

最小可执行动作：

1. 在 Sidebar 顶部加入 Today、Needs Reply、Waiting、Due Soon。
2. 复用 `thread_work_states` 过滤 Needs Reply 和 Waiting。
3. Due Soon v0 可以先基于 `due_at` 和现有任务/提醒数据，不承诺自动理解所有邮件日期。
4. 为每个队列提供空状态、加载态和错误态。
5. 保留传统 Mailboxes，但降级到 Follow-up 队列之后。

验收标准很简单：用户打开 Kirje 后，15 秒内能理解“我该回什么、我在等谁、什么快到期”。
