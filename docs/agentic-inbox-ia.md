# Follow-up Assistant 信息架构

## 元数据

- 阶段：Stage 3A
- 状态：Revised_For_Follow-up_Positioning
- 日期：2026-06-02
- 范围：Kirje 第一版邮件跟进助手的导航、对象、状态、Agent 边界与交互骨架

## 1. 直接判断

Kirje 的第一屏不应该回答“你有多少未读邮件”，而应该回答“今天有哪些回复、跟进和截止日期不能漏”。

当前 Velo/Kirje 的三栏结构可以保留，但信息架构必须重排：Follow-up 队列置顶，传统 Mailboxes 降级，线程阅读面板升级为 Thread Briefing。

这不是视觉 redesign，而是对象模型和操作模型重排。`Agentic` 可以保留为内部对象层命名，但不再作为第一屏用户定位。

## 2. 核心对象

### ThreadWorkState

线程的主工作状态。一个线程同一时间只能有一个 primary state。

建议状态：

- `needs_reply`：需要我回复。
- `waiting`：我在等对方。
- `committed`：我有承诺需要兑现。
- `decision_needed`：需要我判断。
- `risk`：存在关系、商业、安全或时间风险。
- `opportunity`：存在机会。
- `can_archive`：可归档。
- `done`：已处理。

辅助 flags 可以并存：

- `has_agent_suggestion`
- `has_prepared_draft`
- `has_due_date`
- `has_sensitive_content`
- `has_security_warning`
- `is_vip`

### Labels / Folders / Signals

不要把 Kirje 的差异化建立在“再设计一套标签体系”上。

三层边界：

- Action State：Needs Reply、Waiting、Due Soon、Done，决定线程进入哪个 Follow-up 队列。
- Context Label：Gmail label、IMAP folder、本地自定义 label、smart label、smart folder，描述主题或归档上下文。
- Signal：系统从邮件、规则或 AI 中观察到的线索，例如 invoice、travel、deadline、attachment、newsletter、no-reply、security warning。

设计约束：

- Work State 不能伪装成 label。
- Signal 默认不暴露为用户手工标签，除非用户把它转成规则或 smart folder。
- 第一版不要做独立 `Kirje tags`。已有 label/folder/smart folder 足够承载上下文组织，产品精力应放在 Follow-up 队列、Thread Briefing 和可解释信号上。

### AgentAction

Agent 建议或准备的动作。它是信任系统的核心，不是日志附属品。

字段方向：

- `id`
- `account_id`
- `thread_id`
- `message_id`
- `kind`
- `level`：`observe`、`suggest`、`prepare`、`act`
- `risk_level`：`low`、`medium`、`high`
- `status`：`suggested`、`prepared`、`approved`、`rejected`、`executed`、`failed`
- `summary`
- `payload_json`
- `source_refs_json`
- `created_at`
- `reviewed_at`
- `executed_at`
- `error`

典型动作：

- suggest work state。
- suggest archive。
- prepare reply draft。
- prepare follow-up。
- create commitment draft。
- create waiting item。
- create decision item。
- apply rule。

### Commitment

用户已经承诺或疑似承诺的事项。

关键字段：

- `thread_id`
- `contact_id`
- `organization_id`
- `description`
- `due_at`
- `status`：`proposed`、`accepted`、`done`、`dismissed`
- `source_message_id`
- `confidence`

默认规则：Agent 可以提议，用户确认前不能视为正式承诺。

### Waiting

用户正在等待对方的事项。

关键字段：

- `thread_id`
- `waiting_on_contact_id`
- `description`
- `started_at`
- `expected_by`
- `status`：`active`、`resolved`、`dismissed`
- `last_followed_up_at`

### Decision

需要用户判断的事项。

关键字段：

- `thread_id`
- `description`
- `options_json`
- `due_at`
- `risk_level`
- `status`：`open`、`decided`、`dismissed`
- `decision_note`

### BriefingSnapshot

线程简报的缓存结果。

关键字段：

- `thread_id`
- `latest_ask`
- `why_it_matters`
- `relationship_context`
- `commitments_json`
- `waiting_json`
- `risks_json`
- `suggested_actions_json`
- `generated_at`
- `source_hash`

## 3. 导航结构

左侧导航分为三组。

### Follow-up

必须置顶：

- Today
- Needs Reply
- Waiting
- Due Soon

这些是第一版产品本体。

后续可加入但不进入 MVP 首屏：

- Commitments
- Decisions
- Agent Review
- Smart Archive

### Mailboxes

降级但保留：

- Inbox
- Starred
- Snoozed
- Sent
- Drafts
- Trash
- Spam
- All Mail

这些是邮箱基础设施，不是主价值。

### Tools / Rules

后置：

- Smart Folders
- Labels
- Contacts
- Rules / Playbooks
- Settings

## 4. 中间线程列表

Thread List 应该是高密度工作列表，不是邮件预览卡片。

每行建议字段：

- 发件人 / 组织。
- 主题。
- 一行 briefing。
- Primary state chip。
- Priority / risk marker。
- Waiting age 或 due date。
- Agent suggestion marker。
- 附件、星标、置顶等传统 flags。

排序默认：

1. 高风险。
2. 需要回复。
3. 即将到期事项。
4. 等待时间过长。
5. VIP / 高价值关系。
6. 普通未读。

不要让未读成为最高优先级。未读只是状态，不等于重要。

## 5. 右侧 Thread Briefing

打开线程后，顶部先显示 Briefing，再显示消息正文。

Briefing v0 必须回答：

- 对方最新要什么。
- 我是否需要回复。
- 我是否承诺过什么。
- 我正在等谁。
- 有没有风险。
- Agent 建议下一步做什么。

建议布局：

- Compact header：state、priority、risk、due/waiting age。
- Briefing body：latest ask、context、commitments、risks。
- Action row：reply、mark waiting、create commitment、approve agent action、archive/done。
- Messages：完整邮件正文。

不要把 Briefing 做成大卡片堆叠。它是操作摘要，不是展示模块。

## 6. Agent Review Queue

Agent Review 是后续独立队列，不是第一版 Follow-up MVP 的入口，也不是通知中心。

列表字段：

- 动作类型。
- 线程 / 联系人。
- 风险等级。
- 建议摘要。
- 预计影响。
- 状态。

操作：

- Approve。
- Edit。
- Reject。
- Snooze。
- Convert to Rule。

高风险动作必须逐条确认。低风险动作可以多选批量确认，例如建议归档 newsletter、标记无需回复、创建本地 waiting item。

第一版只需要在数据层保留 `AgentAction` 生命周期，并在 UI 中避免让用户误以为 AI 会自动执行。

## 7. Today

Today 是默认工作视图，不是普通 Inbox。

它聚合：

- Needs Reply。
- Waiting overdue。
- Due Soon。
- High-risk threads。

后续再聚合：

- Commitments due。
- Decisions due。
- Agent actions needing review。

目标：用户打开 Kirje 后，15 秒内知道今天最该处理什么。

## 8. Agent 边界

### Observe

允许自动执行：

- 分类线程状态候选。
- 提取承诺候选。
- 提取 waiting 候选。
- 生成 briefing。
- 检测风险。

### Suggest

允许自动创建建议：

- 需要回复。
- 可归档。
- 等待对方。
- 创建承诺。
- 创建决策。
- 跟进提醒。

### Prepare

允许自动准备但不执行：

- 回复草稿。
- 跟进草稿。
- 承诺对象草案。
- 决策选项草案。
- 批量归档候选。

### Act

默认需要确认：

- 发送。
- 删除。
- 归档外部可见或不可逆内容。
- 承诺时间或结果。
- 拒绝、接受、报价、谈判。
- 更新长期关系记忆。
- 启用自动规则。

## 9. 快捷键与命令

第一版只扩展命令，不急着塞满单键快捷键。

命令建议：

- `Mark as Needs Reply`
- `Mark as Waiting`
- `Set Due Soon`
- `Mark as Done`
- `Create Commitment`
- `Create Decision`
- `Open Today`
- `Open Agent Review`（后续）
- `Approve Agent Action`
- `Reject Agent Action`
- `Prepare Reply`
- `Archive if No Action`

已有 `g` 序列可扩展：

- `g` then `r`：Needs Reply。
- `g` then `w`：Waiting。
- `g` then `d`：Due Soon（需要先解决现有 Drafts 冲突）。
- `g` then `t`：Today（需要先解决现有 Sent 冲突）。
- `g` then `x`：Agent Review（后续）。

具体按键要在实现前做冲突检查，不能破坏现有键盘操作肌肉记忆。

## 10. 实现顺序

### Stage 3B：对象模型与数据计划

只做 spec 和 migration plan。

输出：

- SQLite schema。
- TypeScript types。
- Service API。
- Risk model。
- Test plan。

### Stage 3C：Thread Work State v0

实现最小工作状态。

要求：

- 本地 DB 持久化。
- 手动状态修改。
- 线程列表显示 state。
- command palette 可修改 state。
- 测试覆盖 store/service/query。

### Stage 3D：Follow-up Queues Shell

实现左侧 Follow-up 队列和过滤逻辑。

要求：

- Today / Needs Reply / Waiting / Due Soon 在 sidebar 顶部。
- Mailboxes 降级。
- Needs Reply / Waiting / Due Soon 有空状态、加载态、错误态。
- Today 可以先是聚合壳，不需要完整智能排序。

### Stage 3E：Thread Briefing v0

实现 briefing 读模型。

要求：

- 先支持规则 + 缓存 + 手动刷新。
- AI 生成进入 cache，不直接改正式对象。
- Briefing 可以失败，但不能阻塞阅读邮件。

### Stage 3F：Agent Review Queue v0

实现 AgentAction 审核队列。

要求：

- Suggested / prepared / approved / rejected / executed / failed lifecycle。
- 高风险动作不能批量执行。
- 执行路径必须可审计。

## 11. 非目标

这些不是第一批目标：

- CLI 邮箱。
- 多语言 UI。
- 自动发送。
- 完整 CRM。
- 完整项目管理。
- 大面积视觉重做。
- Agent 人格化聊天入口。
- Command Inbox、Agent Review、Smart Archive、Decisions 作为第一屏导航。

结论：Thread Work State 已经是基础骨架；下一步必须把它转化为 Today / Needs Reply / Waiting / Due Soon 的可信队列，否则其他 AI 功能仍然只是漂亮噪音。
