# Technology Stack

**Analysis Date:** 2026-02-24

## Languages

**Primary:**
- TypeScript 5.9.3 - React frontend and service layer
- Rust 1.77.2 - Desktop backend (Tauri), IMAP/SMTP clients, OAuth server

**Secondary:**
- HTML5 / CSS3 - UI markup and styling (via Tailwind CSS)
- JavaScript - Vite build, configuration

## Runtime

**Environment:**
- Node.js (version unspecified in lockfile) - Development and build tooling
- Tauri 2.10.0 - Cross-platform desktop runtime (Windows, macOS, Linux)

**Package Manager:**
- npm - JavaScript/TypeScript dependencies
- Cargo - Rust dependencies

## Frameworks

**Core:**
- React 19.2.4 - UI framework
- Tauri 2.10.0 - Desktop app runtime with native system integration
- Vite 7.3.1 - Frontend build tool and dev server (port 1420)

**State Management:**
- Zustand 5.0.11 - Nine lightweight stores without middleware

**Routing:**
- TanStack Router 1.159.5 - Client-side routing (`src/router/`)

**Rich Text Editor:**
- TipTap 3.19.0 (with extensions: color, highlight, image, link, placeholder, text-align, text-style, underline) - Email composer

**UI Components & Icons:**
- Lucide React 0.563.0 - Icon library
- Tailwind CSS 4.1.18 - Utility-first CSS with custom theme system
- @tailwindcss/vite 4.1.18 - Vite integration

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Accessible drag-and-drop (thread → folder operations)

**Transitions:**
- react-transition-group 4.4.5 - Animation utilities

**Testing:**
- Vitest 4.0.18 - Unit/component test runner (jsdom environment)
- @testing-library/react 16.3.2 - React component testing
- @testing-library/jest-dom 6.9.1 - DOM matchers

**HTML Sanitization:**
- DOMPurify 3.3.1 - Email HTML sanitization and iframe rendering

## Tauri Plugins

**System Integration:**
- tauri-plugin-single-instance - Enforce single app instance, deep link forwarding
- tauri-plugin-autostart - Autostart with `--hidden` flag (minimize to tray)
- tauri-plugin-deep-link - `mailto:` protocol handler registration
- tauri-plugin-global-shortcut - System-wide keyboard shortcut (compose)
- tauri-plugin-tray-icon - System tray with icon and context menu

**File & Dialog:**
- tauri-plugin-fs 2.4.5 - File system access
- tauri-plugin-dialog 2.6.0 - Native file/save dialogs

**Database:**
- tauri-plugin-sql 2.3.2 - SQLite integration (preload: `sqlite:velo.db`)

**Notifications:**
- tauri-plugin-notification 2.3.3 - OS native notifications (Windows AUMID: `com.velomail.app`)

**System Information:**
- tauri-plugin-os 2.3.2 - Platform and OS info
- tauri-plugin-process 2.3.1 - Process management

**Utilities:**
- tauri-plugin-opener 2.5.3 - Open URLs and files
- tauri-plugin-http 2.5.7 - HTTP client (replaces fetch in some contexts)
- tauri-plugin-log 2 - Logging integration
- tauri-plugin-updater 2.10.0 - Auto-update mechanism

## Key Dependencies

**AI/LLM SDKs:**
- @anthropic-ai/sdk 0.74.0 - Claude API integration
- openai 6.21.0 - OpenAI API integration (GPT-4, etc.)
- @google/generative-ai 0.24.1 - Google Gemini API integration

**Email & Protocols:**
- async-imap 0.10 (Rust) - IMAP client with tokio runtime
- lettre 0.11 (Rust) - SMTP client with tokio/native-tls
- mail-parser 0.9 (Rust) - Email message parsing
- tsdav 2.1.8 - CalDAV/WebDAV client (calendar sync)

**Google APIs:**
- Google Gmail API (v1) - Accessed via GmailClient wrapper in `src/services/gmail/`
- Google Calendar API (v3) - Accessed via GoogleCalendarProvider in `src/services/calendar/`
- OAuth2 PKCE flow - No external SDK; native implementation in `src/services/gmail/auth.ts`

**Crypto & Encoding:**
- native-tls 0.2 (Rust) - TLS for IMAP/SMTP
- tokio-native-tls 0.3 (Rust) - Tokio integration for TLS
- base64 0.22 (Rust) - Base64 encoding
- utf7-imap 0.3 (Rust) - IMAP-specific UTF-7 encoding
- Web Crypto API (browser native) - AES-256-GCM for local encryption

**Async & Concurrency:**
- tokio 1.x (Rust) - Async runtime with net, io-util, sync, macros, rt, time features
- futures 0.3 (Rust) - Future combinators

**HTTP & Networking:**
- reqwest 0.12 (Rust) - HTTP client with native-tls
- socket2 0.5 (Rust) - Low-level socket operations (OAuth callback server)

**Data Serialization:**
- serde 1.0 (Rust) - Serialization framework
- serde_json 1.0 (Rust) - JSON serialization

**Logging:**
- log 0.4 (Rust) - Logging facade

## Configuration

**Environment:**
- Vite dev server: port 1420, HMR on 1421 (if `TAURI_DEV_HOST` set)
- OAuth callback: localhost port 17248-17251 (fallback range for PKCE flow)
- OllamaProvider: localhost port 11434 (default, configurable)
- GitHub Copilot: localhost port 1234 (alternative AI provider)

**Build:**
- vite.config.ts - Multi-entry build (main app + splash screen)
- vitest.config.ts - jsdom environment, globals: true, setup file at `src/test/setup.ts`
- tsconfig.json - ES2021 target, strict mode, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- src-tauri/tauri.conf.json - Window config (1200x800 main, 400x300 splash), CSP rules, plugin config

**Capabilities:**
- src-tauri/capabilities/default.json - Tauri permission model for Windows/main/thread-* windows

## Platform Requirements

**Development:**
- Node.js (version unspecified)
- Rust 1.77.2 or later
- npm or compatible package manager
- Tauri CLI (installed via npm: @tauri-apps/cli 2.10.0)
- SQLite 3 (bundled via tauri-plugin-sql)

**Production:**
- Windows 10+, macOS 10.13+, Linux (Ubuntu 20.04+ recommended)
- Tauri bundles dependencies per platform
- SQLite database file: `velo.db` (per-user directory via Tauri paths plugin)
- System tray support (Windows/macOS native; Linux via KSNI)

**Deployment:**
- GitHub Releases - Update distribution (updater plugin fetches from releases)
- Flatpak support - See `com.velomail.app.yml` build config

---

*Stack analysis: 2026-02-24*
