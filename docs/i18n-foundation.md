# Kirje i18n Foundation

## 元数据

- 阶段：T007
- 状态：Ready_For_Review
- 最后更新：2026-06-01
- 范围：i18n 架构、上游 PR 取舍、key taxonomy、中文术语表、实施切片。

## 1. 直接判断

i18n 现在值得做，但只能做成基础设施和核心中文体验，不要做全仓翻译运动。

原因很简单：用户本人现在需要中文界面，这会直接改善 daily use；同时 Kirje 已经完成发布身份、质量基线和 Thread Work State v0，核心产品语言开始稳定。继续拖 i18n 会让后续 Agentic Inbox 文案全部长在英文硬编码里，未来迁移成本更高。

最大风险不是翻译错，而是把 2000 多处 UI 字符串一次性抽光，导致 diff 失控、测试噪音大、Agentic IA 还没稳定就产生大量 key churn。

收敛方案：

- 第一阶段只定架构和术语，也就是 T007。
- 第二阶段接入 `i18next` / `react-i18next`、语言设置和 key parity test，也就是 T028。
- 第三阶段翻译每天高频使用的核心表面，也就是 T029。
- Help、Calendar、Attachments、复杂 Settings 子编辑器和 Rust 托盘菜单后置。

## 2. 上游 PR 取舍

### PR #202

- 标题：`feat(i18n): add full internationalization support (EN/IT)`
- 状态：Open
- 规模：108 files，约 +5925 / -2114。
- 方案：`i18next` / `react-i18next`，12 个 namespaces，EN/IT，语言设置，OS language detection，key parity test。
- 判断：`adapt`。

可采纳：

- `i18next` / `react-i18next` 作为前端 i18n 栈。
- namespace 拆分思路。
- 语言偏好持久化。
- key parity test。

不采纳：

- 整包合并。
- EN/IT 翻译。
- 一次性转换 60+ 组件。
- 在 Kirje Agentic IA 尚未稳定时重构 `helpContent.ts`。

### PR #249

- 标题：`feat: add Japanese localization with react-i18next`
- 状态：Open
- 规模：101 files，约 +6908 / -2370。
- 方案：`react-i18next`，EN/JA，浏览器语言检测，Settings 语言切换，1619 keys，key parity test。
- 判断：`adapt`。

可采纳：

- fallback to English。
- Settings language dropdown。
- key parity test 的验收口径。
- 浏览器/系统语言作为默认值的思路。

不采纳：

- JA 翻译。
- 大爆炸式 key extraction。
- title、placeholder、error boundary 等全表面一次性收口。

结论：两个 PR 都说明上游社区已经自然收敛到 `i18next` / `react-i18next`。Kirje 不需要另造 i18n 框架，但必须用更小的任务切片实现。

## 3. 产品本质

i18n 在 Kirje 里不是“支持多语言”这个漂亮标签。它解决的是 owner 和未来中文高价值用户的处理负担：

- 阅读：降低英文 UI 对邮件处理速度的干扰。
- 判断：让 work state、风险、等待、承诺、Agent 建议这些状态词稳定可理解。
- 回复：让 Composer、Reply Copilot 和 Agent Review 的控制项不会因为英文文案增加心理负担。
- 跟进：让 Waiting、Follow-up、Commitment 这些对象在中文里有一致语义。
- 承诺管理：避免同一对象在不同页面被翻成不同词，损害信任。

i18n 的第一性价值是让 Agentic Inbox 的操作语言稳定，而不是追求翻译覆盖率好看。

## 4. 架构选择

采用：

- `i18next`
- `react-i18next`
- JSON locale resources
- SQLite setting 持久化语言偏好
- English fallback
- key parity test

初始语言：

- `en`
- `zh-CN`

语言设置值：

- `system`：默认，跟随系统或浏览器语言；无法判断时回退 `en`。
- `en`：English。
- `zh-CN`：简体中文。

不建议现在做：

- 在线翻译加载。
- 远程翻译更新。
- 多语言 crowdsource。
- ICU 复杂消息格式。
- 把后端日志、数据库 enum、路由、IPC event 一起本地化。

理由：Kirje 是 local-first 邮箱客户端，i18n 不能引入新的远程依赖面。第一版只需要稳定、可测试、可审计。

## 5. Key Taxonomy

第一版 namespace：

| Namespace | 用途 | 第一阶段状态 |
| --- | --- | --- |
| `common` | 通用动作、状态、日期、错误、确认文案 | 必做 |
| `sidebar` | 左侧账户、邮箱、智能队列、标签 | 必做 |
| `email` | 线程列表、线程状态、邮件动作、阅读面板 | 必做 |
| `composer` | 写信、回复、附件、发送、草稿 | 必做 |
| `search` | 搜索框、命令菜单、Ask Inbox 入口 | 必做 |
| `settings` | 设置页基础区域和语言设置 | 必做 |
| `agentic` | Work State、Agent Review、Commitment、Waiting、Decision | 必做 |
| `accounts` | 添加账户、Gmail/IMAP 配置 | 第二批 |
| `calendar` | 日历页面 | 第二批 |
| `tasks` | 任务页面 | 第二批 |
| `attachments` | 附件库 | 第二批 |
| `help` | 帮助页内容 | 第三批 |

Key 命名规则：

- 使用对象和动作命名，不按组件文件名绑定。
- 保持英文 key，中文只在 locale JSON 中出现。
- 不把变量插值写进 key 名称。
- 不翻译数据库 enum；由展示层映射。
- Agentic 对象词汇进入 `agentic`，不要散落在 `common`。

示例：

```text
common.actions.archive
common.actions.cancel
email.thread.needsReply
email.thread.waiting
composer.actions.sendAndArchive
search.commandPalette.placeholder
settings.language.label
agentic.workState.decisionNeeded
```

## 6. 中文术语表

| English | 中文 | 备注 |
| --- | --- | --- |
| Agentic Inbox | Agentic Inbox | 产品概念保留英文，解释性文案可写“Agentic 收件箱”。 |
| Command Inbox | 指挥台 | 不直译为“命令收件箱”。它是处理入口。 |
| Work Queues | 工作队列 | 指 Needs Reply / Waiting 等队列。 |
| Thread | 线程 | 保持技术/邮箱语境一致。 |
| Message | 邮件 | 不用“消息”。 |
| Needs Reply | 需要回复 | 状态 chip。 |
| Waiting | 等待对方 | 表示我在等别人。 |
| Commitment | 承诺事项 | 表示我答应要做的事。 |
| Decision | 待决策 | 表示需要用户判断。 |
| Follow-up | 跟进 | 动作和对象均可用。 |
| Draft | 草稿 | 标准邮箱词。 |
| Snooze | 稍后提醒 | 不用“贪睡”。 |
| Schedule Send | 定时发送 | 标准邮箱词。 |
| Smart Archive | 智能归档 | Agent 建议低风险归档。 |
| Agent Review | Agent 审核 | 保留 Agent。 |
| Agent Action | Agent 动作 | 审计对象。 |
| Briefing | 简报 | Thread Briefing 译为“线程简报”。 |
| Ask Inbox | 询问收件箱 | 功能名可后续优化。 |
| Quick Steps | 快捷步骤 | 保留现有产品语义。 |
| Smart Folders | 智能文件夹 | 标准中文。 |
| Labels | 标签 | 标准 Gmail 语义。 |
| Split Inbox | 分类收件箱 | 不强调 Gmail 分类名。 |
| Archive | 归档 | 标准邮箱动作。 |
| Trash | 移至废纸篓 | 动作；名词可用“废纸篓”。 |
| Spam | 垃圾邮件 | 标准邮箱词。 |

风格规则：

- UI 文案短、硬、操作导向。
- 少用“您”，默认用无主语动词。
- 不写营销式 AI 文案。
- AI 和 Agent 保留英文，避免翻成“智能体”造成语感笨重。
- 对危险动作使用明确动词：发送、删除、拒绝、归档、标记。

## 7. 最强方案

### T028：i18n Foundation

目标：

- 添加 i18n 初始化。
- 添加 `en` / `zh-CN` locale resource。
- 添加 language setting。
- 添加 key parity test。
- 添加一个最小 UI 切面证明语言切换可用。

范围：

- `package.json`
- `package-lock.json`
- `src/i18n/*`
- `src/main.tsx`
- `src/App.tsx` 或初始化入口
- `src/services/db/settings.ts` 的复用，不新增远程存储
- `src/components/settings/SettingsPage.tsx` 的语言设置最小入口
- 对应测试文件

不做：

- 不翻译全部组件。
- 不重构 Help content。
- 不修改 Agentic 数据模型。

### T029：核心中文界面

目标：

把 daily use 高频路径变成中文可用：

- Sidebar。
- EmailList。
- ThreadCard。
- ReadingPane 基础空态/加载态/错误态。
- ActionBar。
- CommandPalette。
- SearchBar。
- Composer 核心动作。
- Settings 基础区域。
- Agentic work state chips 和 command labels。

不做：

- Calendar 全量中文。
- Attachments 全量中文。
- Tasks 全量中文。
- Help 全量中文。
- 复杂错误日志和开发者文案。

### T030：中文覆盖扩展

目标：

- Accounts setup。
- Calendar。
- Tasks。
- Attachments。
- Help。
- 空态、权限态、AI 失败态、同步失败态补齐。

## 8. Agent 设计

i18n 本身不增加 Agent autonomy，但会影响 Agent 可信度。

Observe：

- Agent 输出和 UI locale 必须一致。
- 识别当前语言设置，用于 briefing、草稿建议和解释文案。

Suggest：

- 建议动作展示中文，但 action type 保持英文 enum。
- 风险说明用中文短句，不用泛泛“AI 建议”。

Prepare：

- 未来草稿可按用户语言偏好生成。
- 但邮件原文语言和用户设置冲突时，应优先尊重线程语境。

Act：

- i18n 不改变 Act 权限。
- 发送、删除、拒绝、承诺、财务、法律、敏感关系动作仍必须人工确认。

必须人工确认：

- 任何因翻译导致含义可能变化的高风险动作文案。
- 任何自动发送或自动承诺。

## 9. Linear 级交互要求

- Language setting 应在 Settings 的基础区域内，使用紧凑 select，不做大卡片。
- 中英文切换不能改变布局密度。
- 状态 chip 的中文要短：`需要回复`、`等待对方`、`待决策`、`可归档`。
- Command Palette 中命令要可搜索英文 key 和中文 label，后续可加 aliases。
- 文案不要解释功能；只命名动作和状态。
- 长中文必须在按钮和列表里做 truncation 或换行约束，不能撑破布局。

## 10. 风险与砍掉项

必须砍掉：

- 一次性全仓翻译。
- 为了 i18n 重做 UI。
- 翻译 release、CI、开发者日志。
- 引入远程翻译平台。
- 现在做多语言官网。
- 把 Agentic Inbox 翻成一堆不同中文名。

主要风险：

- Key churn：Agentic IA 还会变，过早翻译全部 Help 会反复改。
- Layout risk：中文更短但某些状态文案会变宽，需要测试按钮和 chip。
- Trust risk：危险动作翻译含糊会降低用户控制感。
- Test risk：大范围 snapshot/render test 会变脆。

## 11. 验证口径

T028 必须验证：

- `npx vitest run src/i18n/i18n.test.ts`
- `npx tsc --noEmit`
- `npm run test`
- `git diff --check`

T029 必须验证：

- i18n parity test。
- 相关组件 render tests。
- `npx tsc --noEmit`
- `npm run test`
- 至少一次本地 UI 视觉检查，确认中文按钮、chip、列表无明显溢出。

T030 再扩大覆盖面，不压在 foundation PR 内。

## 12. 下一步

进入 T028：添加 i18n foundation。

最小可执行动作：

1. 新增 i18n runtime 和 locale 文件。
2. 新增 `system/en/zh-CN` 语言偏好。
3. Settings 中加入语言选择。
4. 添加 key parity test。
5. 只翻译 Settings language 自身和少量 common 文案，用来证明链路。
