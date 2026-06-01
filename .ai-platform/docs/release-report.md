# Kirje Stage 0/1 交付报告

## 元数据

- 版本：1.0
- 状态：Ready_For_User_Review
- 最后更新：2026-06-01
- 范围：maintenance foundation、上游策略、CI/release governance 基线。

## 摘要

Stage 0 的目标是建立 Kirje 的项目维护控制权，不修改业务代码。Stage 1 当前推进安全与验证基线、CI/CD 基线和 release governance skill。

已包含：

- 上游跟踪设置。
- Codex 维护分支。
- 治理 artifacts。
- 上游 PR intake。
- 基线验证 evidence。

未包含：

- 合并上游 PR。
- 产品功能实现。
- i18n 实现。
- CLI 实现。
- UI redesign。

## Git 证据

- 分支：`codex/maintenance-foundation`
- Upstream remote：`https://github.com/avihaymenahem/velo.git`
- Upstream comparison：`git rev-list --left-right --count HEAD...upstream/main` 返回 `0 0`。
- 当前分支和 upstream `main` 都指向 `ec47a7a5095bb5deffc24e9b6812e39107508dbe`。
- Stage 0 业务代码变更：无。Stage 1 已进入维护和安全修复实现，变更见下方文件清单。
- PR refs：尝试 fetch 完整 `refs/pull/*`，但长时间无输出后出现 `fetch-pack: unexpected disconnect`；已改用 GitHub API 做 PR intake。

## 验证证据

已执行命令：

- `npm ci --loglevel=notice`：通过。约 2 分钟安装 301 个 packages，audit 302 个 packages。报告 6 个漏洞：3 moderate，3 high。
- `npx tsc --noEmit`：通过。
- `npm run test`：通过。133 个 test files 通过；1560 个 tests 通过。非阻塞日志包括预期 service error logs 和部分 React `act(...)` warnings。
- `npm audit --audit-level=moderate`：失败，存在依赖 advisories。涉及 `dompurify`、`markdown-it`、`picomatch`、`postcss`、`undici`、`vite`。
- `cd src-tauri && cargo test`：被 crates.io network/index timeout 阻塞；重复 timeout 后中止。
- `cd src-tauri && cargo test --offline`：失败，因为本地 Cargo cache/index 缺少 `futures`，而 `velo v0.4.21` 需要它。
- `cd src-tauri && cargo build --offline`：同样因为缺少 `futures` 失败。

Stage 1 更新：

- 用户复跑 `cargo test` 后，Cargo 依赖缓存已可用。
- `cargo test`：通过。6 个 Rust tests 通过。
- `cargo build`：通过。
- `npm audit fix`：通过。更新 8 个 packages。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `npm ci --loglevel=notice`：通过，使用更新后的 lockfile 干净安装。
- `npx tsc --noEmit`：通过。
- `npm run test`：通过，133 个 test files、1560 个 tests 通过。
- `cargo test --locked`：通过。
- `cargo build --locked`：通过。
- 新增 `.github/workflows/ci.yml`，覆盖 npm audit moderate、TypeScript、Vitest、Cargo test 和 Cargo build。

Stage 1B 更新：

- Review 上游 PR #245：结论为 `adapt`，不整包合并，拆为安全 slice。
- Review 上游 PR #206：结论为 `adapted`。
- 新增 migration 14 repair：当 v14 被标记 applied 但 `labels.imap_folder_path` 缺失时，只删除 v14 migration record 并重跑 v14。
- 新增 migration repair regression tests，覆盖 partial v14 schema 恢复路径。
- `npx vitest run src/services/db/migrations-repair.test.ts src/services/db/migrations.test.ts`：通过，2 个 test files、10 个 tests 通过。
- `npx tsc --noEmit`：通过。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `cd src-tauri && cargo test --locked`：通过，6 个 Rust tests 通过。
- `cd src-tauri && cargo build --locked`：通过。
- `npm run test`：通过，134 个 test files、1564 个 tests 通过。

Stage 1B #245-A 更新：

- Review 上游 PR #245-A：结论为 `adapted`。
- `compactQueue(accountId)` 的 account filter 从 SQL 字符串插值改为 `$1` 绑定参数。
- 新增 SQL injection regression test，旧实现下失败，修复后通过。
- `npx vitest run src/services/db/pendingOperations.test.ts`：通过，21 个 tests 通过。
- `npx tsc --noEmit`：通过。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `npm run test`：通过，134 个 test files、1565 个 tests 通过。

Stage 1B #245-C 更新：

- Review 上游 PR #245-C：结论为 `adapted`。
- 新增 unsubscribe URL guard，阻止明显 unsafe URL 进入 one-click POST 或 browser fallback。
- 修复上游方案中的 malformed URL logging 二次 throw 风险。
- `npx vitest run src/services/unsubscribe/unsubscribeManager.test.ts`：通过，10 个 tests 通过。
- `npx tsc --noEmit`：通过。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `npm run test`：通过，135 个 test files、1575 个 tests 通过。

Stage 1B #245-E 更新：

- Review 上游 PR #245-E：结论为 `adapted`。
- phishing detector 的 registrable domain 计算增加常见 multi-part ccTLD suffix。
- 新增 4 个 ccTLD brand impersonation regression tests。
- 新增 `.agents/skills/git-governance/SKILL.md`，记录 Kirje Git 分支、worktree、暂存、提交、PR、upstream 和 handoff 规范。
- `npx vitest run src/utils/phishingDetector.test.ts`：通过，68 个 tests 通过。
- `npx tsc --noEmit`：通过。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `npm run test`：通过，135 个 test files、1579 个 tests 通过。

Stage 1B #245-D 更新：

- Review 上游 PR #245-D：结论为 `adapted`。
- Rust OAuth token exchange/refresh 增加 token URL whitelist。
- 白名单只允许当前实际 provider：Microsoft consumers 和 Yahoo。
- 新增 Rust unit tests，覆盖允许 endpoint、拒绝未知 provider、拒绝 non-HTTPS/local、拒绝 query/explicit port/userinfo、拒绝未配置 Microsoft tenant paths。
- 新增 `.agents/skills/test-first-maintenance/SKILL.md`，把行为变更 test-first 写入项目维护 skill。
- `cd src-tauri && cargo test --locked`：通过，11 个 Rust tests 通过。
- `cd src-tauri && cargo build --locked`：通过。
- `npx tsc --noEmit`：通过。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `npm run test`：通过，135 个 test files、1575 个 tests 通过。

Stage 1B 收口验证：

- `npx tsc --noEmit`：通过。
- `npm run test`：通过，135 个 test files、1579 个 tests 通过。
- `npm audit --audit-level=moderate`：第一次因 registry TLS 连接断开失败，重试通过，0 vulnerabilities。
- `cd src-tauri && cargo test --locked`：通过，11 个 Rust tests 通过。
- `cd src-tauri && cargo build --locked`：通过。
- `git diff --check`：通过。
- T012 到 T016 delivery artifact validator：全部通过。

## 变更文件

- 新增 `.ai-platform/memory/constitution.md`。
- 新增 `.ai-platform/docs/product-design.md`。
- 新增 `.ai-platform/docs/technology-decision-record.md`。
- 新增 `.ai-platform/docs/tasks.md`。
- 新增 `.ai-platform/docs/release-report.md`。
- 新增 `docs/upstream-pr-intake.md`。
- 新增 `.ai-platform/evidence/T001` 到 `.ai-platform/evidence/T004` 的 evidence 文件。
- 新增 `.github/workflows/ci.yml`。
- 新增 `.agents/skills/release-governance/SKILL.md`。
- 新增 `docs/upstream-pr-reviews.md`。
- 新增 `src/services/db/migrations-repair.test.ts`。
- 更新 `src/services/db/pendingOperations.ts`，参数化 `compactQueue(accountId)`。
- 更新 `src/services/db/pendingOperations.test.ts`，新增 SQL injection regression test。
- 更新 `src/services/unsubscribe/unsubscribeManager.ts`，增加 safe URL guard。
- 新增 `src/services/unsubscribe/unsubscribeManager.test.ts`。
- 更新 `src-tauri/src/oauth.rs`，增加 OAuth token URL whitelist 和 Rust tests。
- 新增 `.agents/skills/test-first-maintenance/SKILL.md`。
- 更新 `src/utils/phishingDetector.ts`，增加 multi-part ccTLD registrable domain 支持。
- 更新 `src/utils/phishingDetector.test.ts`，新增 ccTLD phishing regression tests。
- 新增 `.agents/skills/git-governance/SKILL.md`。
- 更新 `package-lock.json`，清理 npm audit 漏洞。
- 更新 `src-tauri/Cargo.lock`，同步本地 crate 版本为 `0.4.21`。
- 更新 `src/services/db/migrations.ts`，适配上游 PR #206 的 v14-only schema repair。
- 未修改 `package.json`。

## 残余风险

- npm audit 当前已清零。
- Rust test/build 当前已跑通。
- 现有 release workflow、Homebrew workflow、updater endpoint 和应用标识仍保留 Velo/avihaymenahem 信息；迁移到 Kirje 发布身份需要单独 governed task。
- 本次 Git fetch 完整上游 PR refs 不稳定；当前使用 GitHub API 作为 fallback。
- `AGENTS.md` 是未跟踪的项目指令文件；`.agents/` 下本批次新增 release、test-first 和 Git governance skills。Git handoff 时应按具体路径暂存，避免把无关未跟踪文件混入同一提交。
- PR #206 的 repair 条件仍只覆盖已知故障列 `labels.imap_folder_path`；如果 v14 其他关键列缺失但该列存在，当前 repair 不会触发。后续如发现更多 v14 partial schema，需要升级为完整 v14 schema health check。
- PR #245 已完成 #245-A/#245-C/#245-D/#245-E。#245-F 暂缓到 credential recovery UX 明确后。
- #245-C 仍不能完整防 DNS rebinding；当前只阻止 URL 字面量中的 loopback、private、link-local、metadata、malformed 和 dotless internal host。
- #245-D 当前刻意不支持 Microsoft `/common`、`/organizations` 或 tenant GUID token endpoint；如未来产品要支持组织租户，需要先扩展 provider config 和测试。
- #245-E 使用内置常见 suffix 表，不是完整 Public Suffix List；后续如需要全球高精度域名判断，应引入可维护 PSL 数据或专用库。
- URL intelligence 的可更新数据源应等 Kirje 官网和更新信任链建立后再做，由官网维护版本化、签名校验、可本地缓存的 suffix/URL intelligence 文件；当前不引入远程配置，避免把 phishing 防护变成新的供应链风险。

## Stage 1B 收口判断

- #206、#245-A、#245-C、#245-D、#245-E 已按 Kirje 策略适配。
- #245-F 不进入当前批次；credential corruption 需要先设计恢复 UX、设置页提示和账户级降级策略。
- 当前批次可以进入用户 review 和 Git handoff；下一步不应该继续扩大 upstream PR scope。

## Stage 2B Release Identity Migration

- Draft PR #1 已创建：`https://github.com/iiwish/kirje/pull/1`。
- PR #1 base 为 `main`，head 为 `codex/maintenance-foundation`。
- Frontend 和 Rust CI 已启动。
- 官网域名确认：`kirje.app`。
- 新增 `docs/release-identity-migration.md`。
- 审计发现：全仓身份引用约 443 处；关键发布/运行时/文档身份引用约 138 处。
- 结论：Kirje 不能在 identity migration 前公开发布。updater、signing、bundle id、Homebrew/Flatpak/RPM、本地 DB/key 文件都必须拆分处理。
- 建议 target identity：display name `Kirje`，website `https://kirje.app`，package/Cargo name `kirje`，Tauri identifier 待确认，当前推荐 `app.kirje.desktop`。
- `kirje.app` 初期应承担 homepage、release notes、support、安全策略；updater endpoint 和 URL intelligence 数据源要等签名、版本、缓存和回滚策略建立后再接管。

## Stage 2C Release Freeze 与 Kirje Identity

- 用户确认 Tauri identifier：`app.kirje.desktop`。
- 用户确认不迁移旧本地 `velo.db` / `velo.key`。
- 用户确认 Homebrew tap：`iiwish/homebrew-kirje`。
- Release workflows 已加入 `KIRJE_RELEASES_ENABLED == true` guard；默认不执行正式 release 链路。
- package/Cargo/Tauri identity 已迁移到 Kirje。
- SQLite preload 已改为 `sqlite:kirje.db`。
- crypto key 文件已改为 `kirje.key`。
- Flatpak/metainfo/desktop/spec 文件名与内容已迁移到 Kirje。
- Homebrew workflow 已改为 `iiwish/homebrew-kirje` 和 `kirje` cask。
- updater endpoint 已改为 Kirje GitHub Releases，但 updater signing key 仍未迁移；正式 release 仍冻结。

## Stage 2D Release Readiness Gate

- PR #3 已合并，Kirje release identity 已进入 `main`。
- PR #4 已合并，release readiness gate 已进入 `main`。
- 当前 GitHub repo variables 为空，secrets 为空，release 列表为空。
- `iiwish/homebrew-kirje` 当前不存在。
- 新增 `npm run release:readiness`，把 release 前置条件变成可重复检查。
- 当前 readiness check 预期失败；这是正确结果，说明 release 仍不可启用。
- 新增 `docs/release-readiness.md`，记录 updater signing、GitHub secrets、Homebrew tap、Apple signing 和 release dry run 顺序。

## Stage 3A Product Surface Audit

- 结论：Kirje 应继续基于 Velo 增量演进，不应重写。
- 主要风险：当前产品表面仍是普通邮箱阅读器，AI 能力分散为摘要、回复、搜索、任务提取等组件，没有统一的线程工作状态和 Agent Action 审核层。
- 新增 `docs/product-surface-audit.md`，记录现有资产、核心缺口、保留/重构/砍掉项和第一批改造边界。
- 新增 `docs/agentic-inbox-ia.md`，定义 Work Queues、Thread Work State、AgentAction、Commitment、Waiting、Decision、BriefingSnapshot、Thread Briefing 和 Agent Review Queue。
- 任务图新增 Epic E3，并把 Stage 3 拆为 T021 到 T027。
- 明确 CLI 与 i18n 后置：CLI 依赖稳定 Agentic object model，i18n 依赖稳定 IA 和术语体系。
- 明确下一步不是 UI redesign，而是 T022 Agentic Object Model 与数据计划。

## Stage 3B Agentic Object Model Plan

- PR #5 已合并，Stage 3A 产品表面审计已进入 `main`。
- 新增 `docs/agentic-object-model.md`，定义 Kirje Agentic Inbox 第一批对象模型和数据计划。
- 结论：不要把工作状态直接塞进 `threads`，也不要用 `tasks` 承载所有承诺、等待、决策；应新增独立 Agentic tables，并引用 `(account_id, thread_id)`。
- 计划新增 migration v24：`thread_work_states`、`agent_actions`、`commitments`、`waiting_items`、`decisions`、`briefing_snapshots`。
- 明确 AgentAction lifecycle：`suggested`、`prepared`、`approved`、`rejected`、`executed`、`failed`、`expired`。
- 明确风险边界：高风险动作不能自动执行，不能批量 approve，发送/删除/承诺/拒绝/财务/法律/招聘/投资必须人工确认。
- 明确 T023 最小实现范围：先做本地可控 Thread Work State v0，不做 AI 自动分类。

## 用户审核闸门

本报告已可供用户审核。继续进入发布身份迁移、P0 upstream PR 采纳或 i18n 前，需要用户明确接受对应任务计划。
