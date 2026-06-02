# 上游 Velo PR Intake

## 元数据

- 版本：0.1
- 状态：Ready_For_User_Review
- 来源仓库：`avihaymenahem/velo`
- 快照日期：2026-05-31
- 快照时 open PR 数量：34
- 审核闸门：任何 PR 合入 Kirje 前，都必须有 scoped task 和 validation evidence。

## 当前上游状态

- 上游默认分支：`main`
- 上游 `main` 最新 commit：`ec47a7a5095bb5deffc24e9b6812e39107508dbe`
- Kirje 当前分支 base：与 upstream `main` 相同
- 结论：Stage 0 不需要 merge upstream `main`

## Intake 策略

- 采纳能提高安全性、正确性、输入效率或兼容性的修复。
- 对实现有用但产品形态错误的 PR，优先改造而不是直接合并。
- 拒绝或暂缓增加 surface area 但不能降低邮件处理成本的 PR。
- 依赖更新按安全或兼容性任务处理，不批量合并。
- AI panel/sidebar 类 PR 默认视为产品风险，除非证明它服务 Needs Reply、Waiting、Due Soon 或可审核跟进流程。

## P0：优先 Review

这些 PR 可能影响安全、正确性、账户兼容性或日常可用性。

| PR | 标题 | 作者 | 初始动作 | 原因 |
| --- | --- | --- | --- | --- |
| #245 | fix: harden security across HTTP capabilities, SSRF, crypto, and SQL | atani | 深度 review | 安全/隐私表面，触碰高风险区域。采纳前必须仔细检查。 |
| #206 | fix: repair migration 14 when marked applied but imap_folder_path column missing | guysoft | 深度 review | 数据库 migration repair 可能保护现有用户，但风险高。 |
| #203 | fix: allow native text-editing shortcuts in focused inputs | knabe | Review/改造 | 快捷键优先产品必须保证输入框原生编辑行为正确。 |
| #230 | fix: enable link clicks in email iframe on macOS | edvintb | Review/改造 | 阅读面板行为问题；必须平衡可用性和 iframe 安全。 |
| #259 | fix(ai): allow non-default ports in Tauri HTTP plugin scope | DirkScharff | 谨慎 review | AI/network capability scope 影响安全边界。 |
| #255 | feat: support separate SMTP credentials (username + password) for outgoing server | SaschaOnTour | Review/改造 | 对真实 IMAP/SMTP provider 重要；触碰凭据处理。 |
| #219 | fix: use UTC methods in iCal all-day date formatting | edvintb | Review | Calendar 正确性；如果 scope 小，产品风险较低。 |
| #190 | fix: wire up `h` keyboard shortcut for snooze dialog | knabe | Review | 快捷键完整性；应匹配 Kirje 快捷键模型。 |

## P1：有用，但不是第一批

这些 PR 在质量基线清楚后可能有价值。

| PR | 标题 | 作者 | 初始动作 | 原因 |
| --- | --- | --- | --- | --- |
| #202 | feat(i18n): add full internationalization support (EN/IT) | f-liva | 评估架构 | 与 Kirje i18n 相关，但不能盲目继承翻译/key 结构。 |
| #249 | feat: add Japanese localization with react-i18next | atani | 与 #202 对比 | i18n 架构确定后，可能有可复用 localization patterns。 |
| #248 | feat: improve Gmail setup UX with easy/advanced options | atani | 稍后 review | Onboarding 改进，但不是 Stage 0 foundation。 |
| #242 | feat: add a "Custom (OpenAI Compatible)" AI provider option | wynn5a | 稍后 review | 对 AI-native 用户可能有用；需检查隐私、settings 和 provider abstraction。 |
| #201 | fix: allow remote images to load when block setting is disabled | f-liva | 稍后 review | 邮件渲染/安全设置行为；必须检查隐私影响。 |

## P2：产品风险较高的 AI Surface

这些 PR 可能有可复用实现思路，但默认采纳风险高。

| PR | 标题 | 作者 | 初始动作 | 原因 |
| --- | --- | --- | --- | --- |
| #179 | feat(ai-services): add AI service foundation — urgency, proofread, meetings, digest, contacts, filter suggestions | egouilliard-leyton | 只 audit | 可能与 Follow-up Assistant 重叠，但可能抽象方向错误。 |
| #180 | feat(ai-proofread): add proofread-before-send with ProofreadPanel | egouilliard-leyton | 只 audit | 能力有用，但应进入 Reply Copilot 设计，不是 panel 膨胀。 |
| #181 | feat(ai-urgency): add urgency badge to ThreadCard and InboxDigestPanel | egouilliard-leyton | 只 audit | Urgency 相关，但必须映射 Thread Work State。 |
| #182 | feat(ai-meetings): add meeting detection banner in ThreadView | egouilliard-leyton | 只 audit | Meeting detection 有用，但应转化为 decision/action。 |
| #183 | feat(ai-relationship): add AI relationship summary in ContactSidebar | egouilliard-leyton | 只 audit | Relationship memory 是核心，但必须可审计、local-first。 |
| #184 | feat(ai-settings): add 7 AI feature toggles to Settings AI tab | egouilliard-leyton | 只 audit | 如果 capability model 不清楚，settings 会变成复杂度垃圾桶。 |
| #185 | feat(ai-agent): add Claude tool-use support and AI Agent Panel | egouilliard-leyton | 默认拒绝，除非改造 | Panel-first agent 大概率与 Kirje 的嵌入式跟进流程方向冲突。 |

## P3：依赖、Release、Packaging 或 Installer 队列

不要批量合并。先 review 安全相关性和兼容性。

| PR | 标题 | 初始动作 |
| --- | --- |
| #268 | chore(deps): bump tar from 0.4.44 to 0.4.46 in /src-tauri | 安全 review |
| #267 | chore(deps): bump openssl from 0.10.75 to 0.10.80 in /src-tauri | 安全 review |
| #260 | chore(deps): bump rustls-webpki from 0.103.9 to 0.103.13 in /src-tauri | 安全 review |
| #258 | chore(deps): bump dompurify from 3.3.1 to 3.4.0 | 安全 review |
| #251 | chore(deps-dev): bump vite from 7.3.1 to 7.3.2 in /landing | 暂缓 |
| #250 | chore(deps-dev): bump vite from 7.3.1 to 7.3.2 | 暂缓 |
| #238 | chore(deps): bump picomatch from 4.0.3 to 4.0.4 | 安全 review |
| #237 | chore(deps): bump picomatch from 4.0.3 to 4.0.4 in /landing | 安全 review |
| #236 | chore(deps-dev): bump flatted from 3.3.3 to 3.4.2 in /landing | 暂缓 |
| #231 | Add install.cat installer scripts and quick install docs | 暂缓 |
| #228 | chore(deps): bump undici from 7.21.0 to 7.24.1 | 安全 review |
| #227 | chore(main): release velo 0.4.22 | 对 Kirje 忽略 |
| #212 | chore(deps): bump quinn-proto from 0.11.13 to 0.11.14 in /src-tauri | 安全 review |

## Stage 1 建议

用户批准后，第一批执行顺序：

1. 以 security-first 视角 review #245；只采纳明确安全的 slice。
2. Review #206 的数据库 migration repair；必须要求 migration evidence。
3. Review #203 和 #190，处理 keyboard/input 正确性。
4. 将 #230 和 #201 放在一起 review，判断 iframe/email rendering 与隐私安全。
5. 质量基线清楚后再 review #202 和 #249。

在 Thread Work State 和 Agent Action 模型设计前，不启动 CLI 或 broad AI panel work。
