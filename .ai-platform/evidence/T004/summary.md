# T004 Evidence：基线验证

## 状态

Needs_Review

## 命令

- `npm ci --loglevel=notice`：通过。安装 301 个 packages，audit 302 个 packages，报告 6 个漏洞。
- `npx tsc --noEmit`：通过。
- `npm run test`：通过。133 个 test files 和 1560 个 tests 通过。
- `npm audit --audit-level=moderate`：失败，存在 6 个依赖漏洞。
- `cd src-tauri && cargo test`：被 crates.io index/network timeouts 阻塞，已中止。
- `cd src-tauri && cargo test --offline`：失败，本地 Cargo cache/index 缺少 `futures`。
- `cd src-tauri && cargo build --offline`：失败，本地 Cargo cache/index 缺少 `futures`。

## 结果

前端验证全绿。依赖安全和 Rust 验证需要 Stage 1 跟进。

## 残余风险

由于环境/网络依赖解析问题，本次没有完成 Rust 代码验证。依赖 advisories 包含 high severity packages。
