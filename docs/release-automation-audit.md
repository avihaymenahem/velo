# Kirje Release 自动化审计

## 元数据

- 版本：0.2
- 状态：Needs_Review
- 日期：2026-05-31
- 范围：Git 提交规范、CI、release-please、构建发布、包装分发、Homebrew、updater。

## 直接结论

Stage 2C 后，项目已经把主要发布身份迁移到 Kirje，并加入 release freeze guard。正式发布仍然禁止，直到 Kirje 自有 signing secrets、Homebrew token、updater 验证和 release dry run 完成。

短期应做：

1. 先保留 release 自动化框架。
2. 用新增 CI workflow 保护 PR 和 main。
3. 继续使用 Conventional Commits 驱动 release-please。
4. 暂不发布 Kirje。
5. 单独开 governed task 做 updater signing 和 release dry run。

## 已有能力

### Commit / Versioning

- 已有 `release-please-config.json`。
- 已有 `.release-please-manifest.json`，当前版本为 `0.4.21`。
- release type 为 `node`。
- extra files 包括：
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `app.kirje.Kirje.metainfo.xml`
  - `kirje.spec`

判断：基础版本管理已经存在，并已指向 Kirje identity files。

### Release Automation

- `.github/workflows/release-please.yml`：main push 后创建 release PR；release 创建后调用 build/release、packaging、Homebrew。
- `.github/workflows/release.yml`：构建 Linux、Windows、macOS Tauri assets，并上传到 GitHub release。
- `.github/workflows/packaging.yml`：构建 Flatpak 和 SRPM。
- `.github/workflows/update-homebrew.yml`：更新 Homebrew tap。

判断：自动化链条完整，目标已迁移到 Kirje，但正式 release 被 `KIRJE_RELEASES_ENABLED` guard 冻结。

### CI

- 新增 `.github/workflows/ci.yml`。
- 覆盖：
  - `npm ci`
  - `npm audit --audit-level=moderate`
  - `npx tsc --noEmit`
  - `npm run test`
  - `cargo test --locked`
  - `cargo build --locked`

判断：PR/main 的质量门已建立。

## 主要问题

### P0：Release 仍被冻结

涉及：

- release-please workflow。
- build/release workflow。
- packaging workflow。
- Homebrew workflow。
- updater endpoint。
- signing secrets。

判断：Kirje identity 已迁移，但不能启用 release，直到 signing key、secrets、draft release 和 updater JSON 验证完成。

### P0：Updater Signing 与 Release Secrets 未确认

涉及 GitHub secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `HOMEBREW_TAP_TOKEN`

判断：正式 release 前必须确认哪些 secrets 是 Kirje 自有，哪些继承自 Velo 不可用。

### P1：Release Workflow 没有显式 typecheck / audit

现有 release workflow 的 test job 只跑：

- `npm ci`
- `npm run test`

新增 CI 已覆盖 typecheck/audit/Rust，但 release workflow 本身还没有复用 CI。

判断：短期可接受，因为 PR/main 有 CI；中期应让 release workflow 依赖或重复关键质量门。

### P1：Cargo.lock 版本漂移

`src-tauri/Cargo.toml` package version 是 `0.4.21`，原 `Cargo.lock` 中本地 package version 是 `0.4.18`。Cargo test/build 后会同步为 `0.4.21`。

判断：保留 lockfile 同步是正确的。CI 使用 `cargo test --locked` 和 `cargo build --locked` 可以防止未来漂移。

## Commit 规范

继续使用 Conventional Commits：

- `feat(...)`：minor release。
- `fix(...)` / `perf(...)`：patch release。
- `ci(...)` / `build(...)` / `chore(...)` / `docs(...)` / `test(...)`：默认不触发 release。
- `BREAKING CHANGE:`：major release，必须显式批准。

推荐 scopes：

- `ci`
- `release`
- `deps`
- `security`
- `tauri`
- `packaging`
- `updater`
- `imap`
- `sync`
- `ai`
- `i18n`

## 建议任务

### R001：Release Identity Migration

目标：把 Velo 发布身份迁移为 Kirje。

状态：Stage 2C 已完成主要 identity implementation；release freeze 仍有效。

必须覆盖：

- package name。
- Tauri productName。
- bundle identifier。
- updater endpoint。
- release asset naming。
- app metadata。
- Flatpak/RPM/Homebrew。
- signing/notarization secrets。

风险：高。涉及发布、自动更新、安装包身份；后续只应通过 dedicated release PR 继续。

### R002：Release Workflow Hardening

目标：让 release workflow 复用 CI 质量门。

建议：

- release 前明确跑 typecheck。
- release 前明确跑 npm audit high。
- release 前明确跑 Rust locked test/build。
- release job 与 CI 结果关联。

风险：中。主要是 GitHub Actions 行为和构建时间。

### R003：Commit Skill Consolidation

目标：把 `.agents/skills/commit` 与新增 `release-governance` skill 配合使用。

建议：

- 日常提交使用 `commit` skill。
- CI/release/版本/packaging 改动使用 `release-governance` skill。
- 高风险 release 变更仍走 `.ai-platform` governed task。

风险：低。

## 当前建议

Stage 2C 可以接受 Kirje identity implementation；不要立刻启用 release。

下一步优先级：

1. 审核并接受 Stage 2C identity PR。
2. 单独执行 updater signing key 和 GitHub secrets 配置。
3. 用 draft release 验证 assets 和 updater JSON。
4. 验证后再考虑设置 `KIRJE_RELEASES_ENABLED=true`。
