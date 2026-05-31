# T010 测试结果

- `npm ci --loglevel=notice`：通过，安装 301 个 packages，0 vulnerabilities。
- `npm audit fix`：通过，更新 8 个 packages。
- `npm audit --audit-level=moderate`：通过，0 vulnerabilities。
- `npx tsc --noEmit`：通过。
- `npm run test`：通过，133 个 test files、1560 个 tests 通过。
- `cd src-tauri && cargo test --locked`：通过，6 个 Rust tests 通过。
- `cd src-tauri && cargo build --locked`：通过。
- `python3 /Users/iiwish/.codex/skills/ai-delivery-governor/scripts/validate_delivery_artifacts.py --root /Users/iiwish/self/kirje --task-id T010`：通过。
