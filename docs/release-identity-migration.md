# Kirje Release Identity Migration Plan

## 元数据

- 版本：0.2
- 状态：Needs_Review
- 日期：2026-05-31
- 官网：`https://kirje.app`
- 范围：发布身份、应用身份、分发身份、官网链接、运行时数据身份。

## 直接判断

Kirje 仍然不能公开发布。Stage 2C 已经迁移主要应用/包/分发身份，并加入 release freeze guard；但 updater signing key、release secrets 和真实发布验证还没有完成。

最危险的不是 UI 里显示 Velo，而是以下几类身份还混在一起：

- signing public key 仍是继承值，是否有 Kirje 私钥未确认。
- release workflows 只有在 `KIRJE_RELEASES_ENABLED == true` 时才会执行正式发布链路。
- updater endpoint 已切到 Kirje GitHub Releases，但因为 release frozen，不应被视为已可用发布通道。
- 本地数据库和加密 key 文件已按用户确认直接切到 `kirje.db` / `kirje.key`，不做旧 Velo 数据迁移。

这不是品牌问题，是信任链和用户数据路径问题。

## 身份契约建议

建议先冻结这组目标身份，后续实现不得随意漂移：

| 层级 | 当前 | 建议 | 备注 |
| --- | --- | --- | --- |
| Product display name | `Velo` | `Kirje` | 用户可见名称。 |
| Website | Velo GitHub / `velomail.app` | `https://kirje.app` | 官网、支持、安全数据发布的稳定入口。 |
| npm package name | `velo` | `kirje` | 私有 app 仍应和产品一致。 |
| Rust package name | `velo` | `kirje` | release-please 和 Cargo.lock 需同步。 |
| Tauri productName | `Velo` | `Kirje` | 影响 bundle 产物名。 |
| Tauri identifier | `com.velomail.app` | `app.kirje.desktop` | 用户已确认。 |
| SQLite DB | `velo.db` | `kirje.db` | 用户已确认不迁移旧数据。 |
| Crypto key file | `velo.key` | `kirje.key` | 用户已确认不迁移旧数据。 |
| Updater endpoint | Velo GitHub latest | Kirje GitHub latest，后续可迁到 `kirje.app` | 已配置到 Kirje GitHub Releases；release freeze 仍有效。 |
| Update signing key | Velo inherited value | Kirje 自有 keypair | 必须在发布前确认 secret。 |
| Homebrew tap | `avihaymenahem/homebrew-velo` | `iiwish/homebrew-kirje` | 用户已确认。 |
| Homebrew cask | `velo` | `kirje` | app 名和 zap 路径一起改。 |
| Flatpak id | `com.velomail.app` | `app.kirje.Kirje` 或确认后的 Flathub ID | Flatpak ID 可与 Tauri identifier 不完全相同。 |
| RPM name | `velo` | `kirje` | spec、source tarball、desktop file 同步。 |

## 分层迁移顺序

### P0：发布前必须完成

这些不完成就不能公开 release：

1. `package.json` / `package-lock.json`
   - `name: kirje`
   - flatpak script 改为 Kirje manifest。

2. `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`
   - package name 改为 `kirje`。
   - authors/repository 补为 Kirje 信息。

3. `src-tauri/tauri.conf.json`
   - `productName: Kirje`
   - window title 改为 `Kirje`
   - identifier 改为已确认 Kirje identifier。
   - updater endpoint 改为 Kirje release endpoint。
   - signing pubkey 改为 Kirje 自有 public key。

4. Release workflows
   - `.github/workflows/release.yml`
   - `.github/workflows/release-please.yml`
   - `.github/workflows/packaging.yml`
   - `.github/workflows/update-homebrew.yml`
   - release name、asset name、tag expectation、Homebrew tap、cask、zap paths 全部迁移。

5. Packaging metadata
   - `com.velomail.app.yml`
   - `com.velomail.app.desktop`
   - `com.velomail.app.metainfo.xml`
   - `velo.spec`
   - 文件名本身也应迁移，不只改内容。

6. Runtime OS identity
   - Windows AUMID。
   - tray label、notification title、update toast。
   - macOS app bundle display。

7. Signing / release secrets
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   - Apple signing/notarization secrets。
   - Homebrew tap token。

### P1：必须跟随 P0 或同批完成

这些不是 release blocker 的核心，但若漏掉会显得产品不可信：

- README 下载链接、build 指令、项目名。
- Settings About 页面。
- OAuth success page 文案。
- docs 中的用户可见 Velo 名称。
- Help content 中的产品名称。
- 官网、bugtracker、support email。

### P2：暂不建议现在改

这些是内部协议名，改了收益低、回归风险高：

- `velo-sync-done`、`velo-toggle-command-palette` 等 window events。
- `@velo.local` synthetic IMAP message id domain。
- 测试中描述历史行为的 Velo 字符串。

建议保留到后续内部命名清理任务。用户看不见，Agentic Inbox 核心体验也不依赖它。

## 本地数据迁移策略

用户已确认不需要保留旧 `velo.db` / `velo.key` 数据，因此 Stage 2C 采用直接切换。

如果未来已有公开用户后再做类似迁移，则不能简单删除旧文件。

建议策略：

1. 新版本默认使用 `kirje.db` 和 `kirje.key`。
2. 启动时若 `kirje.db` 不存在但 `velo.db` 存在，展示或执行一次性迁移。
3. `velo.key` 到 `kirje.key` 的迁移必须先验证能解密 OAuth/IMAP secrets。
4. 迁移成功后保留旧文件备份，不自动删除。
5. 迁移失败时停止账户同步，不要尝试发信、删信或刷新 token。

Stage 2C 不实现旧数据导入 fallback，这是明确产品/维护决策，不是遗漏。

## 官网 kirje.app 的角色

`kirje.app` 不应该一开始承担所有发布责任。建议分阶段：

1. Stage 2：官网作为 homepage、support、release notes、privacy/security policy。
2. Stage 3：官网维护安全数据文件，例如 suffix/URL intelligence，但必须签名、版本化、本地缓存。
3. Stage 4：官网可作为 updater stable endpoint 或 GitHub release redirect。

当前不要做“从官网下载远程规则配置”。没有签名、回滚和版本策略时，这是新供应链风险。

## Release workflow 改造策略

建议先做一个“不可自动发布”的迁移 PR：

- 暂停或保护 release jobs，避免 main 合并后误发 Velo-branded release。
- 完成 identity rename。
- 本地和 CI 跑 Tauri build。
- 只在 dry run / draft release 验证 assets。
- signing secrets 确认后再启用正式 release。

## 建议任务拆分

### R001：Release Freeze Guard

状态：Stage 2C 已实现。

目标：在身份迁移期间防止误发布。

动作：

- release workflow 增加显式 guard，或保持 release PR 不合并。
- PR 描述明确“Kirje identity 未完成前禁止 release”。

### R002：Identity Contract Implementation

状态：Stage 2C 已实现主要 app/package/display/runtime identity。

目标：实现 Kirje app/package/display identity。

动作：

- 改 package、Cargo、Tauri、Windows AUMID、visible app strings。
- 加测试覆盖关键配置。

### R003：Data Identity Migration

状态：不执行。用户已确认旧数据不需要迁移。

目标：处理 `velo.db` / `velo.key` 到 Kirje 名称的迁移。

动作：

- 设计一次性迁移和失败降级。
- 重点验证 OAuth token、IMAP password 解密。

### R004：Packaging Migration

状态：Stage 2C 已迁移文件名和工作流引用；真实 packaging release 仍需 signing/secrets 验证。

目标：迁移 Flatpak、RPM、Homebrew、release asset 命名。

动作：

- 文件名和内容一起改。
- Homebrew tap 改为 Kirje 自有 tap。

### R005：Updater Signing Migration

目标：切换到 Kirje updater signing key 和 endpoint。

动作：

- 生成 Kirje signing keypair。
- 配 GitHub secrets。
- updater endpoint 先用 Kirje GitHub release，官网后续接管。

### R006：Website / Support Links

目标：把用户可见外链切到 `kirje.app`。

动作：

- homepage、bugtracker、support email、privacy/security docs。
- About 页面和 README 同步。

## Stage 2C 已完成项

- `package.json` / `package-lock.json` 包名改为 `kirje`。
- `src-tauri/Cargo.toml` / `Cargo.lock` 包名改为 `kirje`。
- Tauri `productName` 改为 `Kirje`。
- Tauri identifier 改为 `app.kirje.desktop`。
- SQLite preload 改为 `sqlite:kirje.db`。
- crypto key 文件改为 `kirje.key`。
- Windows AUMID、tray label、notification title、update toast 改为 Kirje。
- Flatpak/RPM/metainfo/desktop files 迁移到 Kirje 文件名和内容。
- Homebrew workflow 改为 `iiwish/homebrew-kirje` / `kirje` cask。
- release workflows 加入 `KIRJE_RELEASES_ENABLED == true` guard。

## 不做项

- 不生成或提交 updater signing private key。
- 不启用正式 release。
- 不改内部 `velo-*` event names。
- 不做 CLI。
- 不做 i18n。

## 最小下一步

下一步应先接受 Stage 2D readiness gate，然后执行 R005：生成 Kirje updater signing keypair、配置 GitHub secrets，并用 draft release 或 dry run 验证 updater JSON。完成前不应设置 `KIRJE_RELEASES_ENABLED=true`。

Readiness gate：

```bash
npm run release:readiness
```

当前失败是预期状态，表示 Kirje 尚未具备发布条件。
