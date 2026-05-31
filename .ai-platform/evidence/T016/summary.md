# T016 Evidence Summary

## 任务

适配上游 PR #245-E：改进 phishing detector 对常见 multi-part ccTLD 的 registrable domain 计算，并新增 Git governance skill。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：phishing detector 是安全提示路径；Git governance 是后续维护控制面。
- 策略：只采纳 ccTLD registrable domain slice，不引入完整 Public Suffix List 依赖。

## 变更摘要

- `src/utils/phishingDetector.ts`
  - 新增 `MULTI_PART_TLDS` 常见 suffix 表。
  - `getRegistrableDomain()` 在 suffix 命中时返回后三段，例如 `evil.co.uk`、`phishing.co.jp`。

- `src/utils/phishingDetector.test.ts`
  - 新增 4 个 regression tests。
  - 覆盖 `paypal.evil.co.uk`、`www.paypal.co.uk`、`amazon.phishing.co.jp`、`www.netflix.com.au`。

- `.agents/skills/git-governance/SKILL.md`
  - 新增 Git 规范 skill。
  - 记录分支、worktree、暂存、Conventional Commits、PR、upstream 和 handoff 规则。

- `docs/upstream-pr-reviews.md`
  - 将 #245-E 标记为已适配。

- `.ai-platform/docs/tasks.md`
  - 新增 T016 task。

- `.ai-platform/docs/release-report.md`
  - 记录 #245-E 验证结果。

## TDD 证据

新增 regression tests 后，旧实现失败：

- `paypal.evil.co.uk` detail 错误显示为 `co.uk`。
- `www.paypal.co.uk` 被误判为 brand impersonation。
- `amazon.phishing.co.jp` detail 错误显示为 `co.jp`。
- `www.netflix.com.au` 被误判为 brand impersonation。

实现 multi-part ccTLD 支持后，目标测试通过。

## 残余风险

- 当前 suffix 表覆盖常见邮箱场景，不是完整 Public Suffix List。
- 如果 Kirje 未来要做更高精度 URL intelligence，应引入可更新 PSL 数据或专用库，而不是继续手工扩表。
- 该可更新数据源不应现在内置为任意远程配置。更合理的时机是 Kirje 官网和更新信任链建立后，由官网维护一份版本化、签名校验、可本地缓存的 suffix/URL intelligence 文件。
