# T004 测试结果

- `npm ci --loglevel=notice`：通过；报告 6 个漏洞。
- `npx tsc --noEmit`：通过。
- `npm run test`：通过；133 个 test files 和 1560 个 tests 通过。
- `npm audit --audit-level=moderate`：失败；存在 6 个漏洞。
- `cd src-tauri && cargo test`：被 crates.io index/network timeouts 阻塞。
- `cd src-tauri && cargo test --offline`：失败；缺少本地 `futures` package/index。
- `cd src-tauri && cargo build --offline`：失败；缺少本地 `futures` package/index。
