# Changelog

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
