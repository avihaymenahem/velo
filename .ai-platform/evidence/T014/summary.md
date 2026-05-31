# T014 Evidence Summary

## 任务

适配上游 PR #245-C：为 unsubscribe one-click POST 和 browser fallback 增加 safe URL guard。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：unsubscribe 会主动发 HTTP 请求或打开 URL，属于安全敏感路径；但本 slice scope 明确且可测试。
- 策略：只采纳 unsubscribe URL guard，不触碰 HTTP capability、OAuth whitelist、phishing detector 或 credential recovery。

## 变更摘要

- `src/services/unsubscribe/unsubscribeManager.ts`
  - 新增 `isSafeUrl()`。
  - 阻止 invalid URL、非 http(s)、loopback、private IPv4、link-local / metadata IPv4、IPv6 unique-local、IPv6 link-local、IPv4-mapped IPv6、dotless internal hostname。
  - one-click POST 前检查 URL。
  - browser fallback 前检查 URL。
  - safe one-click POST 使用 `redirect: "manual"`。
  - 日志使用 safe host helper，malformed URL 不会再次 `new URL()` throw。

- `src/services/unsubscribe/unsubscribeManager.test.ts`
  - 新增 10 个 tests。
  - 覆盖 safe URL classifier、unsafe POST block、unsafe browser fallback block、malformed URL logging、safe POST、safe browser fallback。

- `docs/upstream-pr-reviews.md`
  - 将 #245-C 标记为已适配。

- `.ai-platform/docs/tasks.md`
  - 新增 T014 task。

- `.ai-platform/docs/release-report.md`
  - 记录 #245-C 验证结果。

## 与上游 PR #245-C 的关键差异

上游方案在 unsafe URL 分支中用 `new URL(parsed.httpUrl).hostname` 打日志；当 URL malformed 时会二次 throw，导致 unsubscribe 流程崩溃。Kirje 版本使用 safe parse helper，invalid URL 只记录 `invalid-url`。

Kirje 版本额外阻止 dotless internal hostnames，例如 `https://printer/unsub`。

## 残余风险

- 当前 guard 不能完整防 DNS rebinding：公共 hostname 仍可能在请求时解析到内网 IP。
- 更强防护需要 Rust/network 层在连接前解析并校验 IP，或将 one-click unsubscribe 默认降级为用户确认。
