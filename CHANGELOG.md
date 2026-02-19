# Changelog

## [0.4.2](https://github.com/avihaymenahem/velo/compare/velo-v0.4.1...velo-v0.4.2) (2026-02-19)


### Features

* **signatures:** add HTML source editor toggle and sanitize signature output ([e1ca851](https://github.com/avihaymenahem/velo/commit/e1ca8512dc5f54278d64cda0f1fc8721f97a525d)), closes [#99](https://github.com/avihaymenahem/velo/issues/99)


### Bug Fixes

* **attachments:** use EmailProvider for IMAP attachment preview and download ([228ca5e](https://github.com/avihaymenahem/velo/commit/228ca5e86be56e080c3a109acbdd07e63c63bdd4)), closes [#100](https://github.com/avihaymenahem/velo/issues/100)
* **settings:** use Tauri OS plugin for reliable platform detection ([07b6890](https://github.com/avihaymenahem/velo/commit/07b6890f9a7daeba666414ccf7b66c2e626902a2))

## [0.4.1](https://github.com/avihaymenahem/velo/compare/velo-v0.4.0...velo-v0.4.1) (2026-02-18)


### Features

* **nav:** add arrow key navigation between messages in thread view ([efd213d](https://github.com/avihaymenahem/velo/commit/efd213d2f0420852be2432e7ef09a1c12231f110))
* **nav:** add arrow key navigation in email list and thread view ([e87c712](https://github.com/avihaymenahem/velo/commit/e87c712a284cee6918f21042764ca90119e8cbb1))
* **nav:** add arrow key navigation in email list with auto-scroll ([9f4b0d8](https://github.com/avihaymenahem/velo/commit/9f4b0d826100492dc781bab6c48b4e0e5ba191af))


### Bug Fixes

* **popout:** set active account in thread pop-out window ([ae60695](https://github.com/avihaymenahem/velo/commit/ae606950a8c1692a5c935d4ea60d384d1093e7e0))
* **test:** update HelpPage test for 14 categories (added tasks) ([ca97b65](https://github.com/avihaymenahem/velo/commit/ca97b656290781f1d81d944e57445a6f1158f287))
* **ui:** replace loading text with skeleton animation and fix platform detection ([02eda9f](https://github.com/avihaymenahem/velo/commit/02eda9fd35f7272222aa4c5e9f28661230bc754b))

## [0.4.0](https://github.com/avihaymenahem/velo/compare/velo-v0.3.19...velo-v0.4.0) (2026-02-18)


### ⚠ BREAKING CHANGES

* Migration 18 adds 3 new database tables (writing_style_profiles, tasks, task_tags) and 2 new default settings. The migration runner now wraps each migration in a transaction. The taskStore is the 9th Zustand store and is initialized on app startup. These changes require a fresh app restart to run the new migration.

### Features

* add AI auto-draft replies with writing style learning and full task manager ([c75dfc5](https://github.com/avihaymenahem/velo/commit/c75dfc5b3cf7b08abc9c8a9c15018dc480413516))
* **ui:** highlight spam threads with dimmed red background ([5766ecb](https://github.com/avihaymenahem/velo/commit/5766ecbc72ea5e121c486d2f21fd7a40a3cd2179))


### Bug Fixes

* create placeholder thread before message insert during IMAP sync ([6c2d013](https://github.com/avihaymenahem/velo/commit/6c2d0135a6b3683dfbce4075a032b9df12ed699a)), closes [#89](https://github.com/avihaymenahem/velo/issues/89)

## [0.3.19](https://github.com/avihaymenahem/velo/compare/velo-v0.3.18...velo-v0.3.19) (2026-02-18)


### Features

* add auto-update via Tauri updater plugin ([7ac2362](https://github.com/avihaymenahem/velo/commit/7ac2362c3ef1c9e9f628fd2232cd16f8ccfc194b))

## [0.3.18](https://github.com/avihaymenahem/velo/compare/velo-v0.3.17...velo-v0.3.18) (2026-02-18)


### Bug Fixes

* resolve nested button warning and 204 response parsing ([e44f063](https://github.com/avihaymenahem/velo/commit/e44f063927b179444711771e87923343b6599a26))


### Performance Improvements

* memoize calendar event buckets, filter descriptions, and contact search ([3eb6042](https://github.com/avihaymenahem/velo/commit/3eb60425bcff8e60a9fc34e23e2abe6f77fdce09))
* optimize rendering, store subscriptions, and DB queries ([0fd4d8c](https://github.com/avihaymenahem/velo/commit/0fd4d8c784a326f30f334cbf4ace46cd7347677e))
* pre-parse filter JSON and lazy load route components ([33440b7](https://github.com/avihaymenahem/velo/commit/33440b7ed272ac04adbb3186f5d81f77f1e45dec))

## [0.3.17](https://github.com/avihaymenahem/velo/compare/velo-v0.3.16...velo-v0.3.17) (2026-02-18)


### Bug Fixes

* guard against undefined payload in parseIdToken ([120b0d7](https://github.com/avihaymenahem/velo/commit/120b0d7668791773a976b192c45c5e20bedfbcba))
* handle missing router context in pop-out thread windows ([b484d86](https://github.com/avihaymenahem/velo/commit/b484d86e7b68b7950c432b9d077b5258ed8fdb15))

## [0.3.16](https://github.com/avihaymenahem/velo/compare/velo-v0.3.15...velo-v0.3.16) (2026-02-18)


### Features

* add Microsoft OAuth2 support for Outlook/Hotmail/Live accounts ([019a5e2](https://github.com/avihaymenahem/velo/commit/019a5e241dc558d6eb384efc5b6e9880643d7383))

## [0.3.15](https://github.com/avihaymenahem/velo/compare/velo-v0.3.14...velo-v0.3.15) (2026-02-18)


### Features

* add standalone workflow to manually sync homebrew tap ([5a33e67](https://github.com/avihaymenahem/velo/commit/5a33e6707175bfa13a443c2e2489e6f40996ee7b))


### Bug Fixes

* allow homebrew tap update on workflow_dispatch triggers ([c31ddc8](https://github.com/avihaymenahem/velo/commit/c31ddc86c022005d1aa02ea9f6e828a39e2bff46))
* only show sync status bar for initial syncs, not delta syncs ([b925610](https://github.com/avihaymenahem/velo/commit/b9256103b9f9f07bb2573f4e539607cbab024e96))
* prevent IMAP sync OOM on large mailboxes and surface sync errors ([61ebc6e](https://github.com/avihaymenahem/velo/commit/61ebc6ef7b1993c2a15f8c0c022657b275fa62c2)), closes [#74](https://github.com/avihaymenahem/velo/issues/74) [#76](https://github.com/avihaymenahem/velo/issues/76)

## [0.3.14](https://github.com/avihaymenahem/velo/compare/velo-v0.3.13...velo-v0.3.14) (2026-02-17)


### Features

* prioritize new account sync to eliminate 20-30s delay ([49bce0f](https://github.com/avihaymenahem/velo/commit/49bce0fc8227d75923642cef26700c13504ee046))

## [0.3.13](https://github.com/avihaymenahem/velo/compare/velo-v0.3.12...velo-v0.3.13) (2026-02-17)


### Features

* add About page to settings ([fa03431](https://github.com/avihaymenahem/velo/commit/fa03431f091a3f84d78eab1122267c35fdd8c722))
* add Homebrew tap auto-update to release workflow ([4a817b0](https://github.com/avihaymenahem/velo/commit/4a817b0dba3bba3b8d4650e3c1a3b57a9f0a72f0))
* add View Source option to message context menu ([c657b0f](https://github.com/avihaymenahem/velo/commit/c657b0f798d70bda0436acbd0ea435afd3f84b63))
* optimize IMAP delta sync with single-connection batch check ([0a62b73](https://github.com/avihaymenahem/velo/commit/0a62b7363c6c7d34592781a711eb8695b8e5ed52))

## [0.3.12](https://github.com/avihaymenahem/velo/compare/velo-v0.3.11...velo-v0.3.12) (2026-02-16)


### Bug Fixes

* starred threads not appearing in Starred folder ([a03db9f](https://github.com/avihaymenahem/velo/commit/a03db9f4877988d7d979980f750ff5daf63bc052))

## [0.3.11](https://github.com/avihaymenahem/velo/compare/velo-v0.3.10...velo-v0.3.11) (2026-02-16)


### Bug Fixes

* IMAP emails not displaying in UI after sync ([18521cf](https://github.com/avihaymenahem/velo/commit/18521cf2cbcb87f75cab25cff21dba9876fb0e31))
* IMAP fetch fallback for servers incompatible with async-imap ([fcc7a45](https://github.com/avihaymenahem/velo/commit/fcc7a45f52e2fe04595d40c0c34926adca5678b4))
* IMAP trash not working for servers with non-standard folder names ([b6cf2c6](https://github.com/avihaymenahem/velo/commit/b6cf2c6d3aae86fa261fd3b20d938ff8c16f36a9))

## [0.3.10](https://github.com/avihaymenahem/velo/compare/velo-v0.3.9...velo-v0.3.10) (2026-02-16)


### Bug Fixes

* IMAP messages downloaded but not stored in database ([1c28a8e](https://github.com/avihaymenahem/velo/commit/1c28a8e7c3e55dfdd3197ba2011e7b82025767f5)), closes [#39](https://github.com/avihaymenahem/velo/issues/39)

## [0.3.9](https://github.com/avihaymenahem/velo/compare/velo-v0.3.8...velo-v0.3.9) (2026-02-16)


### Bug Fixes

* decode IMAP folder names from modified UTF-7 and use real UIDs for sync ([19a919e](https://github.com/avihaymenahem/velo/commit/19a919eece270efaa0751e8d74b42dca6e6f4f54))

## [0.3.8](https://github.com/avihaymenahem/velo/compare/velo-v0.3.7...velo-v0.3.8) (2026-02-16)


### Bug Fixes

* add appdata read/write permissions for Tauri FS baseDir operations ([f9750de](https://github.com/avihaymenahem/velo/commit/f9750de942535e3c245fcfd86b034446bfb37233))

## [0.3.7](https://github.com/avihaymenahem/velo/compare/velo-v0.3.6...velo-v0.3.7) (2026-02-16)


### Bug Fixes

* use baseDir option for Tauri FS operations to resolve scope errors ([7b463dc](https://github.com/avihaymenahem/velo/commit/7b463dcba326e45c59ac5d2d47b967d05591384a))

## [0.3.6](https://github.com/avihaymenahem/velo/compare/velo-v0.3.5...velo-v0.3.6) (2026-02-16)


### Bug Fixes

* resolve nested button warnings, TipTap duplicate extensions, FS scope, and CI type errors ([65c0028](https://github.com/avihaymenahem/velo/commit/65c0028e03315fc7150a1882ed0775344ec345fd))

## [0.3.5](https://github.com/avihaymenahem/velo/compare/velo-v0.3.4...velo-v0.3.5) (2026-02-16)


### Bug Fixes

* add missing path separator in attachment cache directory ([de4355b](https://github.com/avihaymenahem/velo/commit/de4355b799abf316cb4ee729d22c6f03138174f2))
* call sep() as function, not use as string ([b65888b](https://github.com/avihaymenahem/velo/commit/b65888b70578c767a330ec13087c38f66880bda5))
* use join() for paths and hash long attachment IDs for filenames ([d01dd79](https://github.com/avihaymenahem/velo/commit/d01dd794dbe02ef0820bc293e7af39bc37deaa45))

## [0.3.4](https://github.com/avihaymenahem/velo/compare/velo-v0.3.3...velo-v0.3.4) (2026-02-16)


### Bug Fixes

* suppress notifications for muted threads in deltaSync ([4d21334](https://github.com/avihaymenahem/velo/commit/4d21334efc8d2e6d078173fad28c76f1bd1fcc46))
* wire phishing sensitivity setting and improve brand impersonation detection ([e063c9d](https://github.com/avihaymenahem/velo/commit/e063c9df676dea3757357bebc092e48cbc181513))
