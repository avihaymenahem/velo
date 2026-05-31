# T015 Evidence Summary

## 任务

适配上游 PR #245-D：为 Rust OAuth token exchange/refresh 增加 token URL whitelist，并把 test-first 维护原则写入项目 skill。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：OAuth token exchange/refresh 是认证边界，属于高风险安全路径。
- 策略：只允许 Kirje 当前实际支持的 OAuth provider token endpoint，不复制上游未使用的 Google/Apple endpoint，也不提前支持 Microsoft tenant wildcard。

## 变更摘要

- `src-tauri/src/oauth.rs`
  - 新增 `validate_token_url()`。
  - `oauth_exchange_token()` 和 `oauth_refresh_token()` 请求前调用 whitelist。
  - 允许：
    - `https://login.microsoftonline.com/consumers/oauth2/v2.0/token`
    - `https://api.login.yahoo.com/oauth2/get_token`
  - 拒绝 unknown provider、Google/Apple、non-HTTPS、localhost/127.0.0.1、query、fragment、userinfo、explicit port、Microsoft `/common` 和 `/organizations`。
  - 新增 5 个 Rust whitelist unit tests。

- `.agents/skills/test-first-maintenance/SKILL.md`
  - 新增项目内 test-first maintenance skill。
  - 明确行为、安全、数据库、同步、认证、发信/删信、AI 自动化和上游 PR 适配默认先写失败测试。

- `docs/upstream-pr-reviews.md`
  - 将 #245-D 标记为已适配。

- `.ai-platform/docs/tasks.md`
  - 新增 T015 task。

- `.ai-platform/docs/release-report.md`
  - 记录 #245-D 验证结果。

## TDD 证据

第一次 `cargo test --locked` 失败在 `rejects_extra_url_components`：

- 测试期望显式 `:443` 端口被拒绝。
- `reqwest::Url::port()` 会把默认 443 端口规范化为 `None`，导致过宽放行。
- 修复方式：额外从原始 authority 中检测 explicit port。

修复后 `cargo test --locked` 通过。

## 与上游 PR #245-D 的关键差异

上游白名单包含 Google 和 Apple token endpoint，并允许 Microsoft 多 tenant path pattern。Kirje 当前只支持 Microsoft consumers 和 Yahoo，因此本次只允许这两个实际 endpoint。

这避免把未实现 provider 的 endpoint 加入安全边界，减少“看起来完整但实际上无产品路径”的攻击面。

## 残余风险

- 如果未来要支持 Microsoft organization tenant、Google OAuth IMAP 或 Apple OAuth，需要先扩展 provider registry、UX 和 tests，再扩展 Rust whitelist。
- Rust 全仓 `cargo fmt --check` 当前会触发大量既有格式化 diff；本任务未做全仓格式化，避免无关 churn。
