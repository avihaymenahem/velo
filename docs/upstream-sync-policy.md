# Kirje 上游同步策略

## 元数据

- 版本：0.2
- 状态：Ready_For_User_Review
- 来源：用户批准的维护策略讨论。
- 最后更新：2026-06-02
- 审核闸门：用户批准后，作为 Kirje 后续跟随 Velo 的默认策略。

## 直接结论

Kirje 不应放弃跟随 Velo，但也不应做 Velo 的长期下游同步分支。

正确关系是：

> Velo 是 Kirje 的 upstream patch source，不是 Kirje 的 product source。

也就是说，Kirje 持续吸收安全、协议、兼容性、依赖和底层稳定性修复；但产品方向、AI 体验、信息架构和 UI 体验由 Kirje 自主决定。

## 跟随范围

### 必须持续评估吸收

- 安全修复。
- OAuth、token、Gmail API、IMAP、SMTP 修复。
- SQLite、migration、数据一致性修复。
- Tauri、Rust、平台兼容性修复。
- 依赖安全更新。
- 会影响发送、删除、归档、同步、离线队列正确性的 bugfix。

### 选择性吸收

- 输入体验修复。
- 搜索修复。
- 邮件渲染修复。
- 同步稳定性改进。
- 账户设置、provider compatibility、onboarding 修复。
- 小范围快捷键行为修复。

### 默认不吸收

- 新 UI 风格。
- 普通邮箱功能堆叠。
- AI panel/sidebar 方向。
- 与 Kirje Follow-up Assistant IA 或线程工作状态模型冲突的功能。
- 没有降低处理成本的“智能”功能。

### 只借鉴，不直接合并

- 大型 AI feature。
- 任务、CRM、日历等产品扩张。
- 影响数据模型的大功能。
- 影响长期 context memory 或 Agent autonomy 的设计。

## 分支策略

```text
upstream/main                原始 Velo，只 fetch，不改
main                         Kirje 稳定主线
codex/maintenance-foundation 治理与维护基础
codex/upstream-sync-YYYYMM   周期性上游同步评估分支
codex/adopt-pr-<number>      单个上游 PR 采纳或改造分支
```

## 同步节奏

- 每周轻量检查 upstream `main`。
- 每月做一次正式 upstream sync review。
- 安全更新立即插队。
- 不做“看到 upstream 更新就 merge”。

## 标准流程

### 1. 观察 upstream

```bash
git fetch upstream main
git log --oneline --left-right main...upstream/main
git diff --stat main...upstream/main
```

若需要 review open PR：

```bash
gh api 'repos/avihaymenahem/velo/pulls?state=open&per_page=100'
```

### 2. 分类

每个 upstream commit 或 PR 必须分类：

- `security`
- `bugfix`
- `dependency`
- `infra`
- `platform`
- `product`
- `ai`
- `ui`
- `docs`

### 3. 决策

每项必须给出一个结论：

- `adopt`：可以按原意采纳。
- `adapt`：实现思路可用，但需要按 Kirje 方向改造。
- `reject`：不采纳。
- `defer`：暂缓，等待上下文或依赖稳定。
- `needs-review`：需要安全、数据或产品深入 review。

### 4. 执行方式

优先级：

1. Cherry-pick 单个低风险 commit。
2. 复制/改造 PR 的具体 slice。
3. 对小范围上游 bugfix 建独立 task 后重实现。
4. 只有在差异清楚、低风险、产品方向一致时，才考虑 merge upstream `main`。

## 高风险同步闸门

以下类型必须走 governed task，并需要用户确认：

- 数据库 migration。
- OAuth、token、credential、加密。
- Gmail API、IMAP、SMTP。
- 邮件发送、删除、归档、移动。
- 同步、离线队列、冲突处理。
- AI 自动执行。
- 依赖大版本升级。
- Tauri capability 或 CSP 改动。
- Release/publish/package signing。

## Review 表格式

每次 upstream sync review 应记录：

| 项目 | 类型 | 风险 | 建议 | 触碰范围 | 验证命令 | 是否需用户批准 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR/commit | security/bugfix/product/etc. | low/medium/high | adopt/adapt/reject/defer | files/modules | commands | yes/no | decision |

## 禁止事项

- 不长期机械 merge upstream `main`。
- 不批量合并 open PR。
- 不批量合并 dependabot。
- 不把 AI panel/sidebar PR 当作 Kirje Agent 或 Follow-up 方向。
- 不把 upstream UI 当成 Kirje UI 标准。
- 不在没有 validation evidence 的情况下合入高风险路径。

## 当前判断

截至 2026-05-31，Kirje 当前分支与 upstream `main` 相同，因此无需同步 upstream `main`。

下一步应做的是：

1. 优先 review 安全和稳定性 PR。
2. 处理依赖 audit 高危项。
3. 解决 Rust validation 被 crates.io 网络和本地 cache 阻塞的问题。
4. 在质量基线稳定后，评估 i18n PR。
