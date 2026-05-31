# 上游 PR Review 记录

## 元数据

- 版本：0.6
- 状态：Ready_For_User_Review
- 日期：2026-05-31
- 范围：Stage 1B P0 upstream PR review。

## 总结

Stage 1B 不批量合并上游 PR。每个 PR 的结论必须是 `adopt`、`adapt`、`reject`、`defer` 或 `needs-review`。

当前结论：

| PR | 标题 | 风险 | 建议 | 结论 |
| --- | --- | --- | --- | --- |
| #245 | security hardening across HTTP capabilities, SSRF, crypto, SQL | High | adapt | #245-A/#245-C/#245-D/#245-E 已适配；#245-F 暂缓 |
| #206 | repair migration 14 when column missing | High | adapted | 已按 Kirje 策略实现：只重跑 v14，不重放 v20/v21 |

## PR #245：Security Hardening

链接：https://github.com/avihaymenahem/velo/pull/245

### 触碰范围

- `src-tauri/capabilities/default.json`
- `src-tauri/src/oauth.rs`
- `src/services/db/accounts.ts`
- `src/services/db/pendingOperations.ts`
- `src/services/db/settings.ts`
- `src/services/unsubscribe/unsubscribeManager.ts`
- `src/services/unsubscribe/unsubscribeManager.test.ts`
- `src/utils/phishingDetector.ts`
- `src/utils/phishingDetector.test.ts`

### 好的部分

- `compactQueue(accountId)` 的 SQL interpolation 确实应改成参数化。
- HTTP capability 收窄方向正确：plain HTTP 不应默认放开。
- OAuth token URL whitelist 方向正确：Rust backend 不能接受任意 token endpoint。
- Unsubscribe SSRF guard 方向正确：one-click unsubscribe 会发请求，必须限制内网/metadata 目标。
- ccTLD registrable domain 改进有价值，可以减少 phishing false positive/false negative。
- DOMPurify 等依赖安全问题已在 Stage 1A 通过 `npm audit fix` 处理，和该 PR 的部分安全目标一致。

### 阻塞性问题

1. `isSafeUrl()` 返回 false 后，调用方仍直接 `new URL(parsed.httpUrl).hostname` 打日志。如果 `parsed.httpUrl` 是形如 `https://%` 的 malformed URL，`isSafeUrl()` 会 catch 并返回 false，但日志处会再次 throw，导致 unsubscribe 流程崩溃。采纳时必须改成安全解析 helper。

2. PR 声称 SSRF prevention，但实现仍承认 DNS rebinding limitation。由于 Tauri HTTP capability 允许所有 HTTPS，`https://public.example` 解析到内网 IP 的情况仍可能发生。不能把这个 slice 宣称为完整 SSRF 防护。Kirje 若要高标准处理，应考虑 Rust 侧解析/连接前 IP 检查，或将 one-click unsubscribe 先降级为用户确认。

3. Decryption hardening 只让 `getAllAccounts()` 跳过损坏账户，但 `getAccount()` / `getAccountByEmail()` 仍会因为 `decryptAccountTokens()` 抛错而向上冒泡。这个行为可能是正确的，但需要明确 UX：设置页、发送、同步、unsubscribe 中遇到损坏凭据时应该显示可恢复错误，而不是静默崩溃。

4. OAuth whitelist 方向正确，但采纳时要以 Kirje 当前 provider 表为准。目前本地非 Gmail OAuth provider 只有 Microsoft 和 Yahoo。不要引入未使用的 Apple/Google endpoint 作为“看起来完整”的白名单，除非对应 provider 已存在或有测试。

### 建议拆分

- #245-A：参数化 `compactQueue()`，加 SQL injection regression test。
- #245-B：收窄 Tauri HTTP capability，并确认 Ollama/LM Studio/local AI 仍可用。
- #245-C：实现 unsubscribe safe URL guard，但修复 malformed URL logging，并明确 DNS rebinding residual risk。
- #245-D：OAuth token URL whitelist，仅覆盖当前 provider，并加 Rust unit tests。
- #245-E：ccTLD phishing detector 改进，加现有 test suite。
- #245-F：credential decryption hardening，必须先设计 corrupted credential UX。

### 当前决策

`adapt`。不整包合并。

已完成：

- #245-A：`compactQueue(accountId)` 已改为绑定参数，并补 SQL injection regression test。
- #245-C：unsubscribe safe URL guard 已适配，并修复上游 malformed URL logging 会二次 throw 的问题。
- #245-D：OAuth token URL whitelist 已适配，只允许当前实际支持的 Microsoft consumers 和 Yahoo token endpoint。
- #245-E：phishing detector ccTLD registrable domain 改进已适配，覆盖 `co.uk`、`co.jp`、`com.au` 等常见 suffix。

暂缓：

- #245-F：credential decryption hardening，直到 corrupted credential UX 明确后再做。

## PR #206：Migration 14 Repair

链接：https://github.com/avihaymenahem/velo/pull/206

### 触碰范围

- `src/services/db/migrations.ts`
- `src/services/db/migrations-repair.test.ts`

### 好的部分

- 问题真实：`_migrations` 记录 migration 14 已应用，但 `labels.imap_folder_path` 不存在，会导致后续 IMAP/Gmail sync 路径失败。
- 修复位置正确：应在 `runMigrations()` 读取 applied versions 后、执行 pending migrations 前做 repair。
- 本地 migration runner 已经容忍 `duplicate column`，所以删除 v14+ migration records 并重跑，在部分 schema 已存在时有一定安全性。
- PR 沿用了 migration 18 repair 的思路，符合现有代码风格。

### 需要加强的地方

1. PR 的测试没有模拟“部分 v14 columns 已经存在，重跑 v14 时部分 ALTER TABLE 抛 duplicate column”的真实情况。虽然本地 runner 已容忍 duplicate column，但这个关键保障应该有测试覆盖。

2. 上游 PR 删除 `_migrations WHERE version >= 14`，会重跑 v14 之后所有 migrations。Kirje 不采用这个做法，因为当前 v20/v21 会清理 IMAP attachment 和 folder sync state，作为 schema repair 重放过重。

3. Repair 条件只检查 `labels.imap_folder_path`。如果 v14 其他关键列缺失，例如 `accounts.provider` 或 `messages.imap_uid`，这个 repair 不会触发。可以先按 PR 原方案修已知 bug，但后续应考虑 v14 schema health check 是否需要覆盖多列。

### 当前决策

`adapted`。已作为第一个实际采纳 PR 完成 Kirje 版本：

- Repair 只在 v14 已记录且 `labels.imap_folder_path` 缺失时触发。
- Repair 只删除 `_migrations` 中 version 14 的记录，让 v14 重跑。
- 保留 migration runner 现有 duplicate column 容忍逻辑，用于恢复部分应用的 v14 schema。
- 新增 regression tests，覆盖缺失列、无需 repair、未应用 v14、partial schema 重跑四种路径。
- 完整验证已通过，记录在 `.ai-platform/evidence/T012/`。

## Stage 1B 下一步建议

1. 暂缓 #245-F credential decryption hardening，直到 corrupted credential UX 有明确设计。
2. Stage 1B 可以进入整体审核和 Git handoff。
