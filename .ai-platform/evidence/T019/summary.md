# T019 Evidence Summary

## 任务

Stage 2C：Release freeze guard 与 Kirje identity implementation。

## 执行方式

- 模式：Governed Delivery / Direct Execute。
- 原因：发布身份、Tauri identifier、updater endpoint、DB/key 文件、packaging metadata 都是高风险 release/data surface。
- 用户确认：
  - Tauri identifier 使用 `app.kirje.desktop`。
  - 不迁移保留旧 `velo.db` / `velo.key`。
  - Homebrew tap 使用 `iiwish/homebrew-kirje`。

## 变更摘要

- Release workflows：
  - `.github/workflows/release-please.yml`
  - `.github/workflows/release.yml`
  - `.github/workflows/packaging.yml`
  - `.github/workflows/update-homebrew.yml`
  - 默认要求 `vars.KIRJE_RELEASES_ENABLED == 'true'` 才执行正式 release/packaging/Homebrew 链路。

- App/package identity：
  - `package.json` / `package-lock.json` name 改为 `kirje`。
  - `src-tauri/Cargo.toml` / `Cargo.lock` package name 改为 `kirje`。
  - `src-tauri/tauri.conf.json` 使用 `Kirje`、`app.kirje.desktop`、`sqlite:kirje.db`、Kirje GitHub updater endpoint。

- Runtime visible identity：
  - Windows AUMID、tray label、notification title、update toast、OAuth success page、About page 等迁移到 Kirje。
  - Calendar PRODID 改为 `Kirje`。

- Packaging identity：
  - `com.velomail.app.yml` -> `app.kirje.Kirje.yml`。
  - `com.velomail.app.desktop` -> `app.kirje.Kirje.desktop`。
  - `com.velomail.app.metainfo.xml` -> `app.kirje.Kirje.metainfo.xml`。
  - `velo.spec` -> `kirje.spec`。

## TDD 证据

先修改 identity regression tests 后，旧实现失败：

- `tauri.conf.json` 仍返回 `Velo` / `com.velomail.app` / `sqlite:velo.db`。
- `crypto.ts` 仍读取 `velo.key`。
- `UpdateToast` 仍显示 `Velo`。
- Calendar PRODID 仍为 `Velo Mail`。

实现迁移后，目标测试通过。

## 残余风险

- Updater public key 仍是继承值；必须由 R005 生成 Kirje 自有 keypair 并配置 secrets。
- `KIRJE_RELEASES_ENABLED` 不应设置为 true，直到 draft release、assets、updater JSON、Homebrew token 和 signing secrets 全部验证。
- 内部 `velo-*` window event names 暂不迁移；这是刻意保留的内部协议名，避免扩大回归面。
- 旧 `velo.db` / `velo.key` 不迁移是用户确认的前公开发布阶段决策。
