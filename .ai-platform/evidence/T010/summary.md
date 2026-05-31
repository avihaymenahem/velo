# T010 Evidence：CI 与 Release Governance 基线

## 状态

Needs_Review

## 结果

已添加基础 CI workflow，并添加项目内 `release-governance` skill，用于后续版本、release、CI/CD 和 packaging 维护。
CI 的 npm audit 门槛为 `moderate`，与本地 Stage 1A 验证一致。

## 变更文件

- `.github/workflows/ci.yml`
- `.agents/skills/release-governance/SKILL.md`
- `package-lock.json`
- `src-tauri/Cargo.lock`

## 残余风险

- 现有 release workflow、Homebrew workflow、updater endpoint 和应用标识仍保留 Velo/avihaymenahem 信息；这需要单独的品牌/发布迁移任务，不应在本任务里顺手改。
- GitHub Actions 需要 push 后才能验证真实 runner 行为。
