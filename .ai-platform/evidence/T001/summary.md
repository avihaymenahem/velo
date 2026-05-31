# T001 Evidence：上游跟踪与维护分支

## 状态

Needs_Review

## 命令

- `git switch -c codex/maintenance-foundation`：通过。
- `git remote add upstream https://github.com/avihaymenahem/velo.git`：通过。
- `git fetch upstream main`：通过。
- `git rev-list --left-right --count HEAD...upstream/main`：通过，返回 `0 0`。
- `git remote -v`：通过，显示 `origin` 为 `iiwish/kirje`，`upstream` 为 `avihaymenahem/velo`。

## 结果

Kirje 当前位于 `codex/maintenance-foundation`。当前分支和 `upstream/main` 都在 `ec47a7a5095bb5deffc24e9b6812e39107508dbe`。

## 残余风险

本次完整 PR refs fetch 不稳定，已改用 GitHub API 生成 PR intake。
