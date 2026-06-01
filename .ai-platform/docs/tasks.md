# Kirje 维护任务图

## 元数据

- 版本：0.1
- 状态：Ready_For_User_Review
- 最后更新：2026-05-31
- 审核闸门：需要用户明确批准后，任务才成为 confirmed execution units。

## Epic E0：维护基础

### T001：建立上游跟踪和维护分支

状态：Needs_Review
优先级：P0
依赖：无
阻塞：T002、T003
Story / Requirement: FR-002、FR-003、AC-001、AC-002
可并行：否
冲突：无

目标：
设置 upstream tracking 和 Codex 维护分支，但不合并上游代码。

Allowed files: 
- Git metadata only。

测试目标：
- 无。

Deliverables: 
- `upstream` remote。
- 分支 `codex/maintenance-foundation`。
- 已记录 upstream/main comparison。

验收标准：
- `git remote -v` 显示 upstream Velo。
- `git rev-list --left-right --count HEAD...upstream/main` 结果已记录。
- 没有业务代码变更。

Definition of Done: 
- Remote 和 branch 存在。
- Evidence 已写入 release report。

验证命令：
- `git remote -v`
- `git rev-list --left-right --count HEAD...upstream/main`

TDD plan: 
- 不适用。该任务只改变 Git metadata，没有行为表面。

Packet path：
- Stage 0 轻量维护任务不需要 packet。

Evidence required: 
- 命令结果摘要。

### T002：创建维护治理 artifacts

状态：Needs_Review
优先级：P0
依赖：T001
阻塞：T004
Story / Requirement: FR-002、AC-003
可并行：否
冲突：无

目标：
创建 Kirje 维护和产品方向的可审核 SSOT artifacts。

Allowed files: 
- `.ai-platform/memory/constitution.md`
- `.ai-platform/docs/product-design.md`
- `.ai-platform/docs/technology-decision-record.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`

测试目标：
- 无。

Deliverables: 
- 状态为 `Ready_For_User_Review` 的治理文档。

验收标准：
- 文档包含元数据、状态、scope、review gate 和可执行下一步。
- 文档不声称用户已 acceptance。

Definition of Done: 
- 文件存在并可供用户审核。

验证命令：
- `find .ai-platform -type f | sort`

TDD plan: 
- 不适用。该任务只创建治理文档。

Packet path：
- Stage 0 文档任务不需要 packet。

Evidence required: 
- 文件列表和 diff 摘要。

### T003：创建上游 PR intake

状态：Needs_Review
优先级：P0
依赖：T001
阻塞：T005
Story / Requirement: FR-003、AC-004
可并行：否
冲突：无

目标：
按优先级、产品契合度和下一步动作，对上游 Velo open PR 分类。

Allowed files: 
- `docs/upstream-pr-intake.md`

测试目标：
- 无。

Deliverables: 
- PR intake 文档。

验收标准：
- 当前 open upstream PR 全部被表示或汇总。
- 高优先级 PR 有明确下一步动作。
- AI-panel 类 PR 在 review 前被视为产品风险。

Definition of Done: 
- Intake 存在并可供用户审核。

验证命令：
- `gh api 'repos/avihaymenahem/velo/pulls?state=open&per_page=100'`

TDD plan: 
- 不适用。该任务从上游 metadata 创建 intake 文档。

Packet path：
- Stage 0 文档任务不需要 packet。

Evidence required: 
- PR 数量和优先级摘要。

### T004：记录基线验证

状态：Needs_Review
优先级：P0
依赖：T002
阻塞：T006
Story / Requirement: FR-004、AC-005
可并行：否
冲突：无

目标：
运行干净基线验证并记录 pass/fail/blocked 状态，不修复继承失败。

Allowed files: 
- `.ai-platform/docs/release-report.md`

测试目标：
- Node install。
- TypeScript。
- Vitest。
- Cargo test。
- Cargo build。

Deliverables: 
- Release report 中的验证结果。

验收标准：
- 命令记录 exit status 或明确 blocked reason。
- 不隐藏失败。

Definition of Done: 
- Baseline status 已记录。

验证命令：
- `npm ci`
- `npx tsc --noEmit`
- `npm run test`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo build`

TDD plan: 
- 不适用。该任务只记录 baseline validation，不修改实现。

Packet path：
- Stage 0 baseline task 不需要 packet。

Evidence required: 
- 命令结果和 residual risk。

## Epic E1：上游 Intake 与质量基线

### T010：建立 CI 与 Release Governance 基线

状态：Needs_Review
优先级：P0
依赖：T004、用户批准 Stage 1
阻塞：发布自动化迁移、正式 release
Story / Requirement: FR-004、NFR-005、NFR-006
可并行：否
冲突：`.github/workflows/*`、package lockfiles、release automation。

目标：
建立 PR/push CI 基线，清理当前 npm audit high 风险，并添加项目内 release governance skill。

Allowed files:
- `.github/workflows/ci.yml`
- `.agents/skills/release-governance/SKILL.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T010/*`
- `package-lock.json`
- `src-tauri/Cargo.lock`

测试目标：
- npm audit。
- TypeScript。
- Vitest。
- Cargo test/build。
- Artifact validator。

Deliverables:
- GitHub Actions CI workflow。
- 0 npm audit vulnerabilities。
- Rust validation evidence。
- Release governance skill。

验收标准：
- CI 覆盖 npm install、npm audit moderate、TypeScript、Vitest、Cargo test、Cargo build。
- 不修改 release identity、updater endpoint、bundle identifier 或 Homebrew tap。
- 项目内 skill 能指导后续 commit/version/release 自动化维护。

Definition of Done:
- 本地验证通过或明确记录阻塞项。
- T010 evidence 写入 `.ai-platform/evidence/T010/`。

验证命令：
- `npm audit --audit-level=moderate`
- `npx tsc --noEmit`
- `npm run test`
- `cd src-tauri && cargo test --locked`
- `cd src-tauri && cargo build --locked`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T010`

TDD plan:
- 不适用。该任务修改 CI/release governance 和依赖安全 lockfile，不改变产品行为。

Packet path：
- Stage 1 维护基线任务不需要独立 packet。

Evidence required:
- CI diff 摘要、依赖 audit 结果、Rust/frontend 验证结果、release blocker 说明。

### T011：审计 Release 自动化与提交规范

状态：Needs_Review
优先级：P0
依赖：T010
阻塞：Release Identity Migration
Story / Requirement: NFR-005、NFR-006
可并行：否
冲突：无

目标：
审计当前 Git 提交规范、versioning、release-please、CI/CD、packaging、Homebrew 和 updater 自动化现状。

Allowed files:
- `docs/release-automation-audit.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/evidence/T011/*`

测试目标：
- 文档审计任务，无 source test。

Deliverables:
- Release 自动化审计文档。
- Release identity migration blocker 列表。
- 后续 release hardening 任务建议。

验收标准：
- 明确现有自动化能力。
- 明确 Velo/Kirje 发布身份冲突。
- 明确哪些发布相关变更必须单独 governed task。

Definition of Done:
- 审计文档存在并可供用户审核。
- T011 evidence 已记录。

验证命令：
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T011`

TDD plan:
- 不适用。该任务只做 release 自动化审计。

Packet path：
- Stage 1 审计文档任务不需要 packet。

Evidence required:
- 文档路径和关键 findings。

### T009：建立上游同步策略

状态：Needs_Review
优先级：P0
依赖：T002、用户批准上游策略方向
阻塞：T005
Story / Requirement: FR-003
可并行：否
冲突：无

目标：
明确 Kirje 后续如何跟随 Velo：Velo 是 patch source，不是 product source。

Allowed files:
- `.ai-platform/memory/constitution.md`
- `.ai-platform/docs/technology-decision-record.md`
- `.ai-platform/docs/tasks.md`
- `docs/upstream-sync-policy.md`

测试目标：
- 治理 artifact validator。

Deliverables:
- 上游同步策略文档。
- 宪章中的上游策略原则。
- TDR 中的上游同步决策。
- Task graph 中的 T009 记录。

验收标准：
- 策略明确 adopt/adapt/reject/defer 决策模型。
- 策略明确哪些上游更新必须跟、选择性跟、默认不跟、只借鉴不合并。
- 策略明确高风险同步闸门。
- 不修改业务代码。

Definition of Done:
- 文档存在并可供用户审核。
- T001-T004 artifact validation 仍通过。

验证命令：
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T001`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T002`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T003`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T004`

TDD plan:
- 不适用。该任务只更新治理文档，不改变产品行为。

Packet path：
- Stage 0/1 策略文档任务不需要 packet。

Evidence required:
- 文档 diff 摘要和 validator 结果。

### T005：评估 P0 上游 PR candidates

状态：Needs_Review
优先级：P0
依赖：T003、用户批准 task graph
阻塞：T012、T013、后续上游 PR slice
Story / Requirement: FR-003
可并行：否
冲突：被选中 PR 触碰的业务代码。

目标：
Review 并决定 P0 上游 PR 是采纳、改造还是拒绝。

Allowed files: 
- 按单个 PR 单独限定。

测试目标：
- 按单个 PR 单独限定。

Deliverables: 
- 每个 PR 的 review notes 和被选中 adoption tasks。

验收标准：
- 每个 P0 PR 都有 decision 和 evidence。

Definition of Done:
- Review 结果写入 `docs/upstream-pr-reviews.md`。
- T005 evidence 写入 `.ai-platform/evidence/T005/`。
- 不修改业务代码。

验证命令：
- 按单个 PR 单独限定。

TDD plan:
- 不适用。该任务只做上游 PR review，不改变产品行为。

Packet path：
- `.ai-platform/specs/upstream-pr-intake/packets/T005.yaml`

Evidence required: 
- Review notes、采纳 PR 的 diff summary、验证结果。

### T012：适配上游 PR #206 migration 14 修复

状态：Needs_Review
优先级：P0
依赖：T005、用户批准继续 Stage 1B
阻塞：T007、后续 IMAP 稳定性工作
Story / Requirement: FR-003、FR-004
可并行：否
冲突：数据库 migrations。

目标：
适配上游 PR #206 的 migration 14 repair，但避免重放 v20/v21 的破坏性 IMAP resync migration。

Allowed files:
- `src/services/db/migrations.ts`
- `src/services/db/migrations-repair.test.ts`
- `docs/upstream-pr-reviews.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T012/*`

测试目标：
- migration repair regression。
- TypeScript。
- npm audit。
- Vitest full suite。
- Rust test/build。
- Artifact validator。

Deliverables:
- v14-only migration repair。
- partial migration regression tests。
- T012 evidence。

验收标准：
- 当 `_migrations` 记录 v14 已应用但 `labels.imap_folder_path` 缺失时，只删除 v14 migration record 并重跑 v14。
- 不删除 `_migrations WHERE version >= 14`。
- 测试覆盖部分 v14 columns 已存在、重跑 v14 时 duplicate column 被容忍的路径。
- 验证命令全部通过。

Definition of Done:
- T012 evidence 写入 `.ai-platform/evidence/T012/`。
- 完整验证通过或阻塞项明确记录。

验证命令：
- `npx vitest run src/services/db/migrations-repair.test.ts src/services/db/migrations.test.ts`
- `npx tsc --noEmit`
- `npm audit --audit-level=moderate`
- `cd src-tauri && cargo test --locked`
- `cd src-tauri && cargo build --locked`
- `npm run test`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T012`

TDD plan:
- 先补 migration repair regression tests，再实现最小 v14-only repair。

Packet path：
- Stage 1B 单 PR 适配任务不需要独立 packet；采用 Direct Execute，因为当前环境未启用 worker，且用户已明确要求继续。

Evidence required:
- Diff 摘要、测试结果、与上游 PR #206 的差异、残余风险。

### T013：适配上游 PR #245-A compactQueue 参数化

状态：Needs_Review
优先级：P0
依赖：T005、T012、用户批准继续 Stage 1B
阻塞：T014、后续 #245 security slices
Story / Requirement: FR-003、FR-004、NFR-004
可并行：否
冲突：offline queue DB service。

目标：
适配上游 PR #245 的 SQL 安全 slice，将 `compactQueue(accountId)` 的 account filter 从字符串插值改为绑定参数。

Allowed files:
- `src/services/db/pendingOperations.ts`
- `src/services/db/pendingOperations.test.ts`
- `docs/upstream-pr-reviews.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T013/*`

测试目标：
- SQL injection regression。
- TypeScript。
- npm audit。
- Vitest full suite。
- Artifact validator。

Deliverables:
- `compactQueue()` 参数化查询。
- 回归测试断言恶意 accountId 不进入 SQL 文本。
- T013 evidence。

验收标准：
- `compactQueue(accountId)` 使用 `$1` 绑定参数。
- 无 accountId 路径保持查询全部 pending ops。
- 回归测试先在旧实现失败，修复后通过。
- 验证命令通过。

Definition of Done:
- T013 evidence 写入 `.ai-platform/evidence/T013/`。
- 完整前端验证通过或阻塞项明确记录。

验证命令：
- `npx vitest run src/services/db/pendingOperations.test.ts`
- `npx tsc --noEmit`
- `npm audit --audit-level=moderate`
- `npm run test`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T013`

TDD plan:
- 先添加 SQL injection regression test，并确认旧实现失败。
- 再改为绑定参数并验证通过。

Packet path：
- Stage 1B 单安全 slice 任务不需要独立 packet；采用 Direct Execute，因为 scope 小且用户已批准继续。

Evidence required:
- 失败测试摘要、修复后验证结果、diff 摘要、残余风险。

### T014：适配上游 PR #245-C unsubscribe safe URL guard

状态：Needs_Review
优先级：P0
依赖：T005、T013、用户批准继续 Stage 1B
阻塞：T015、后续 #245 security slices
Story / Requirement: FR-003、FR-004、NFR-004
可并行：否
冲突：unsubscribe service。

目标：
适配上游 PR #245 的 unsubscribe URL 安全 slice，防止 one-click unsubscribe 或 browser fallback 请求明显的内网、metadata、loopback 和 malformed URL。

Allowed files:
- `src/services/unsubscribe/unsubscribeManager.ts`
- `src/services/unsubscribe/unsubscribeManager.test.ts`
- `docs/upstream-pr-reviews.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T014/*`

测试目标：
- Safe URL classifier。
- one-click POST guard。
- browser fallback guard。
- malformed URL logging 不 throw。
- TypeScript。
- npm audit。
- Vitest full suite。
- Artifact validator。

Deliverables:
- `isSafeUrl()` guard。
- unsubscribe one-click POST 和 browser fallback 的安全检查。
- regression tests。
- T014 evidence。

验收标准：
- unsafe URL 不触发 `fetch()`。
- unsafe URL 不触发 `openUrl()`。
- malformed URL 不因日志路径再次 throw。
- safe one-click URL 仍可 POST，并使用 `redirect: "manual"`。
- safe non-one-click URL 仍可 browser fallback。
- 文档明确 DNS rebinding 是残余风险。

Definition of Done:
- T014 evidence 写入 `.ai-platform/evidence/T014/`。
- 完整前端验证通过或阻塞项明确记录。

验证命令：
- `npx vitest run src/services/unsubscribe/unsubscribeManager.test.ts`
- `npx tsc --noEmit`
- `npm audit --audit-level=moderate`
- `npm run test`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T014`

TDD plan:
- 新增 URL classifier 和 executeUnsubscribe regression tests。
- 实现 safe URL guard，并确认测试通过。

Packet path：
- Stage 1B 单安全 slice 任务不需要独立 packet；采用 Direct Execute，因为 scope 小且用户已批准继续。

Evidence required:
- Diff 摘要、验证结果、与上游 PR #245-C 的差异、残余风险。

### T015：适配上游 PR #245-D OAuth token URL whitelist

状态：Needs_Review
优先级：P0
依赖：T005、T014、用户批准继续 Stage 1B
阻塞：T016、后续 #245 security slices
Story / Requirement: FR-003、FR-004、NFR-004
可并行：否
冲突：OAuth Rust command、项目维护 skill。

目标：
适配上游 PR #245 的 OAuth token URL whitelist slice，限制 Rust token exchange/refresh 只能请求 Kirje 当前实际支持的 OAuth provider token endpoint，并把 test-first 维护原则写入项目 skill。

Allowed files:
- `src-tauri/src/oauth.rs`
- `.agents/skills/test-first-maintenance/SKILL.md`
- `docs/upstream-pr-reviews.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T015/*`

测试目标：
- Rust whitelist unit tests。
- Rust build。
- TypeScript。
- npm audit。
- Vitest full suite。
- Artifact validator。

Deliverables:
- token URL whitelist。
- Rust regression tests。
- test-first maintenance skill。
- T015 evidence。

验收标准：
- Microsoft consumers token endpoint 允许。
- Yahoo token endpoint 允许。
- Google/Apple/未识别 token endpoint 拒绝。
- 非 HTTPS、本地地址、query/fragment/username/explicit port 拒绝。
- 未配置的 Microsoft `/common`、`/organizations` endpoint 拒绝。
- `oauth_exchange_token` 和 `oauth_refresh_token` 都调用 whitelist。
- skill 明确行为变更默认 test-first。

Definition of Done:
- T015 evidence 写入 `.ai-platform/evidence/T015/`。
- 验证命令通过或阻塞项明确记录。

验证命令：
- `cd src-tauri && cargo test --locked`
- `cd src-tauri && cargo build --locked`
- `npx tsc --noEmit`
- `npm audit --audit-level=moderate`
- `npm run test`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T015`

TDD plan:
- 先新增 whitelist unit tests，并确认旧实现或过宽实现失败。
- 再实现最小 whitelist。

Packet path：
- Stage 1B 单安全 slice 任务不需要独立 packet；采用 Direct Execute，因为用户已批准继续。

Evidence required:
- 失败测试摘要、验证结果、与上游 PR #245-D 的差异、残余风险、skill 变更摘要。

### T016：适配上游 PR #245-E ccTLD phishing detector 改进

状态：Needs_Review
优先级：P0
依赖：T005、T015、用户批准继续 Stage 1B
阻塞：后续 credential UX 设计
Story / Requirement: FR-003、FR-004、NFR-004
可并行：否
冲突：phishing detector、Git workflow skill。

目标：
适配上游 PR #245 的 phishing detector ccTLD slice，修复 registrable domain 计算对常见多段 ccTLD 的误判，并把 Git 管理规范写入项目 skill。

Allowed files:
- `src/utils/phishingDetector.ts`
- `src/utils/phishingDetector.test.ts`
- `.agents/skills/git-governance/SKILL.md`
- `docs/upstream-pr-reviews.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T016/*`

测试目标：
- ccTLD brand impersonation regression。
- TypeScript。
- npm audit。
- Vitest full suite。
- Artifact validator。

Deliverables:
- 常见 multi-part ccTLD suffix 表。
- registrable domain 计算修复。
- phishing detector regression tests。
- Git governance skill。
- T016 evidence。

验收标准：
- `paypal.evil.co.uk` 标记为 brand impersonation，并显示 `evil.co.uk`。
- `www.paypal.co.uk` 不标记为 brand impersonation。
- `amazon.phishing.co.jp` 标记为 brand impersonation，并显示 `phishing.co.jp`。
- `www.netflix.com.au` 不标记为 brand impersonation。
- Git skill 记录 branch、worktree、staging、commit、PR、upstream 和 handoff 规范。

Definition of Done:
- T016 evidence 写入 `.ai-platform/evidence/T016/`。
- 验证命令通过或阻塞项明确记录。

验证命令：
- `npx vitest run src/utils/phishingDetector.test.ts`
- `npx tsc --noEmit`
- `npm audit --audit-level=moderate`
- `npm run test`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T016`

TDD plan:
- 先新增 ccTLD phishing regression tests，并确认旧实现失败。
- 再实现 multi-part ccTLD registrable domain 计算。

Packet path：
- Stage 1B 单安全 slice 任务不需要独立 packet；采用 Direct Execute，因为用户已批准继续。

Evidence required:
- 失败测试摘要、验证结果、与上游 PR #245-E 的差异、Git skill 变更摘要、残余风险。

### T017：设计可更新 URL intelligence 数据源

状态：Draft
优先级：P2
依赖：Kirje 官网、更新信任链、用户批准安全数据更新策略
阻塞：全球高精度 phishing intelligence
Story / Requirement: NFR-004、NFR-006
可并行：是
冲突：phishing detector、release/update trust chain、官网安全数据发布。

目标：
在 Kirje 官网和更新信任链建立后，设计一份版本化、签名校验、可本地缓存的 suffix/URL intelligence 数据文件，用于补充或替代当前内置常见 multi-part ccTLD 表。

Allowed files:
- 待官网仓库和 updater strategy 明确后确定。

测试目标：
- 数据文件签名校验。
- 本地缓存和回滚。
- phishing detector regression。
- 离线 fallback。

Deliverables:
- URL intelligence 数据格式。
- 签名和版本策略。
- 本地缓存策略。
- 回滚和失效策略。
- phishing detector 集成方案。

验收标准：
- App 不信任未签名或降级版本的数据文件。
- 网络不可用时继续使用最后一次验证通过的数据或内置 fallback。
- 数据更新失败不能阻塞邮件阅读和基础 phishing 检测。
- 用户隐私不因下载安全数据而泄露邮箱内容、联系人或访问 URL。

Definition of Done:
- 官网数据发布机制和 app 验证机制都有测试。
- 失败和离线路径有明确 UX。

验证命令：
- 由实现任务确定。

TDD plan:
- 先写签名校验、降级保护、离线 fallback 和 phishing regression tests。
- 再实现数据加载和缓存。

Packet path：
- 后续官网和更新链路明确后生成。

Evidence required:
- 威胁模型、数据格式、验证命令、失败路径截图或日志摘要。

### T018：Stage 2B Release Identity Migration 审计与计划

状态：Needs_Review
优先级：P0
依赖：Stage 1 maintenance foundation PR 已创建、用户批准进入 Stage 2B
阻塞：Kirje 正式 release、updater endpoint 迁移、官网发布链路
Story / Requirement: FR-004、NFR-005、NFR-006
可并行：否
冲突：release identity、package metadata、Tauri identifier、updater、packaging、local data identity。

目标：
审计 Kirje 仍继承 Velo 发布身份的位置，并制定迁移顺序。该任务只输出计划，不直接修改 app identity。

Allowed files:
- `docs/release-identity-migration.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T018/*`

测试目标：
- 全仓身份引用扫描。
- GitHub PR/CI 状态检查。
- Delivery artifact validator。

Deliverables:
- Kirje release identity migration plan。
- `kirje.app` 在官网、updater、安全数据中的阶段性角色。
- R001 到 R006 后续任务拆分。
- T018 evidence。

验收标准：
- 明确哪些身份迁移是 P0 release blocker。
- 明确哪些内部 `velo-*` 命名暂不改。
- 明确本地 `velo.db` / `velo.key` 迁移风险。
- 明确 implementation 前需要用户确认的问题。

Definition of Done:
- T018 evidence 写入 `.ai-platform/evidence/T018/`。
- 计划文档可供用户审核。

验证命令：
- `rg -n "Velo|velo|velomail|avihaymenahem|com\\.velomail" --glob '!node_modules' --glob '!src-tauri/target' --glob '!dist' --glob '!*.patch' | wc -l`
- `gh pr view 1 --repo iiwish/kirje --json url,state,isDraft,headRefName,baseRefName,statusCheckRollup`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T018`

TDD plan:
- 不适用。该任务是 release identity 审计和计划，不改产品行为。

Packet path：
- Stage 2B 审计任务不需要独立 packet；采用 Direct Execute，因为用户已明确批准继续。

Evidence required:
- 身份引用扫描结果、PR/CI 状态、迁移计划、残余风险。

### T019：Stage 2C Release Freeze 与 Kirje Identity 实现

状态：Accepted
优先级：P0
依赖：T018、用户确认 `app.kirje.desktop`、用户确认不迁移旧本地数据、用户确认 `iiwish/homebrew-kirje`
阻塞：R005 updater signing、release dry run、正式 Kirje release
Story / Requirement: FR-004、NFR-005、NFR-006
可并行：否
冲突：release workflows、package metadata、Tauri config、packaging metadata、local DB/key identity、visible app strings。

目标：
实现 Stage 2C：冻结 release automation，迁移 Kirje app/package/display/runtime identity，并保留 signing/updater 发布启用为后续任务。

Allowed files:
- `.github/workflows/release-please.yml`
- `.github/workflows/release.yml`
- `.github/workflows/packaging.yml`
- `.github/workflows/update-homebrew.yml`
- `.github/CODEOWNERS`
- `package.json`
- `package-lock.json`
- `release-please-config.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- `src-tauri/src/oauth.rs`
- `app.kirje.Kirje.*`
- `kirje.spec`
- source/docs visible identity files
- `.ai-platform/docs/*`
- `.ai-platform/evidence/T019/*`

测试目标：
- Identity regression tests。
- TypeScript。
- npm audit。
- Vitest full suite。
- Rust test/build locked。
- Delivery artifact validator。

Deliverables:
- Release freeze guard。
- Kirje package/Cargo/Tauri identity。
- Kirje DB/key file names。
- Kirje visible runtime strings。
- Kirje Flatpak/RPM/Homebrew metadata paths。
- T019 evidence。

验收标准：
- `src-tauri/tauri.conf.json` 使用 `Kirje`、`app.kirje.desktop`、`sqlite:kirje.db`、Kirje updater endpoint。
- Crypto 使用 `kirje.key`。
- Release workflows 默认不执行正式 release，除非 `KIRJE_RELEASES_ENABLED == true`。
- Packaging metadata 不再引用 Velo release identity。
- 内部 `velo-*` event names 保留并记录为暂不迁移。

Definition of Done:
- T019 evidence 写入 `.ai-platform/evidence/T019/`。
- 验证命令通过或阻塞项明确记录。

验证命令：
- `npx vitest run src/config/tauriConfig.test.ts src/utils/crypto.test.ts src/components/ui/UpdateToast.test.tsx src/services/calendar/icalHelper.test.ts`
- `npx tsc --noEmit`
- `npm audit --audit-level=moderate`
- `npm run test`
- `cd src-tauri && cargo test --locked`
- `cd src-tauri && cargo build --locked`
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T019`

TDD plan:
- 先新增/修改 identity regression tests 并确认旧实现失败。
- 再实现 release identity 和 runtime identity 迁移。

Packet path：
- Stage 2C 采用 Direct Execute，因为用户已明确批准继续，且当前环境未启用 worker。

Evidence required:
- 失败测试摘要、验证结果、identity 扫描结果、残余 release blockers。

### T020：Stage 2D Release Readiness Gate

状态：Needs_Review
优先级：P0
依赖：T019 accepted / PR #3 merged
阻塞：正式 Kirje release、`KIRJE_RELEASES_ENABLED=true`
Story / Requirement: FR-004、NFR-005、NFR-006
可并行：否
冲突：release workflow、GitHub secrets、updater signing、Homebrew tap。

目标：
在生成和配置真实 signing/secrets 前，先建立机器可重复执行的 release readiness gate，防止靠人工记忆启用发布链路。

Allowed files:
- `package.json`
- `scripts/release-readiness.mjs`
- `docs/release-readiness.md`
- `docs/release-automation-audit.md`
- `docs/release-identity-migration.md`
- `.ai-platform/docs/tasks.md`
- `.ai-platform/docs/release-report.md`
- `.ai-platform/evidence/T020/*`

Deliverables:
- `npm run release:readiness`
- 中文 release readiness runbook。
- 记录当前 GitHub variables、secrets、release、Homebrew tap 状态。

验收标准：
- Readiness script 检查 Kirje app identity、updater endpoint、updater public key 是否仍是继承值、required GitHub secrets、`KIRJE_RELEASES_ENABLED`、Homebrew tap。
- 当前仓库未配置 release secrets 时，readiness command 必须失败并清楚列出 blockers。
- 文档明确 release enable 顺序，且不得要求提交私钥。

测试目标：
- Release readiness negative gate。
- Full Vitest regression。
- Diff whitespace check。

Definition of Done:
- `release:readiness` 命令存在并输出清晰 blockers。
- 中文 release readiness runbook 存在。
- T020 evidence 写入 `.ai-platform/evidence/T020/`。

验证命令：
- `node scripts/release-readiness.mjs`
- `npm run release:readiness`
- `npm run test`
- `git diff --check`

TDD plan:
- Release readiness 是运维 gate，不修改产品行为；以当前仓库缺少 secrets/variables 的预期失败作为负向验证。

Packet path：
- Stage 2D 采用 Direct Execute，因为任务是小范围 release gate 和文档，不启用 worker。

Evidence required:
- readiness command 输出摘要、GitHub variables/secrets/release 状态、残余 blockers。

### T006：修复基线验证失败

状态：Draft
优先级：P0
依赖：T004、用户批准 task graph
阻塞：产品功能工作
Story / Requirement: FR-004
可并行：否
冲突：取决于失败范围。

目标：
在 Stage 0 记录失败后，修复继承的 baseline failures。

Allowed files: 
- 由 validation failures 决定。

验证命令：
- `npx tsc --noEmit`
- `npm run test`
- `cd src-tauri && cargo test`
- `cd src-tauri && cargo build`

Packet path：
- `.ai-platform/specs/quality-baseline/packets/T006.yaml`

Evidence required: 
- 修复前失败结果和修复后通过结果。

## Epic E2：产品基础

### T007：设计 i18n foundation

状态：Draft
优先级：P1
依赖：T005、T006、用户批准 task graph
阻塞：i18n implementation
Story / Requirement: FR-005
可并行：否
冲突：UI text extraction 和 settings。

目标：
评估上游 i18n PR 后，决定 Kirje 的 i18n 架构。

Allowed files: 
- 批准前只写 spec 和 plan。

验证命令：
- 实现任务前不适用。

Packet path：
- `.ai-platform/specs/i18n-foundation/packets/T007.yaml`

Evidence required: 
- i18n spec、key taxonomy、对上游 i18n PR 的采纳/拒绝理由。

### T008：定义 CLI future contract

状态：Draft
优先级：P2
依赖：Agentic Inbox object model spec
阻塞：CLI implementation
Story / Requirement: FR-006
可并行：是
冲突：如果只写文档则无。

目标：
在线程工作状态和 Agent Action 对象稳定后，把 CLI 定义为未来操作层。

Allowed files: 
- 未来 `docs/cli-future.md` 或 `.ai-platform/specs/cli-future/spec.md`。

验证命令：
- 实现任务前不适用。

Packet path：
- `.ai-platform/specs/cli-future/packets/T008.yaml`

Evidence required: 
- CLI non-goals、命令形态、对 Agentic Inbox object model 的依赖。
