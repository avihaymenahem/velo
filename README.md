<p align="center">
  <img src="assets/icon.png?v1" alt="Melo" width="200" height="200" style="border-radius: 24px;" />
</p>

<h1 align="center">Melo</h1>

<p align="center">
  <strong>Email at the speed of thought.</strong>
</p>

<p align="center">
  A blazing-fast, keyboard-first desktop email client built with Tauri, React, and Rust.<br />
  Local-first. Privacy-focused. AI-powered.
</p>

<p align="center">
  <a href="#features">Features</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#installation">Installation</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/keyboard-shortcuts.md">Shortcuts</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/architecture.md">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/development.md">Development</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

<p align="center">
  <img width="1920" height="1032" alt="Screenshot 2026-02-17 223320" src="https://github.com/user-attachments/assets/dd096d15-4c1e-438c-99f9-c38b50a8a437" />
</p>

---

## Why Melo?

Most email clients are slow, bloated, or send your data to someone else's server. Velo is different:

- **Local-first** — Your emails live in a local SQLite database. No middleman servers. Read your mail offline.
- **Keyboard-driven** — Superhuman-inspired shortcuts let you fly through your inbox without touching the mouse.
- **AI-enhanced** — Summarize threads, generate replies, and search your inbox in natural language — with your choice of AI provider, including fully local models.
- **Native performance** — Rust backend via Tauri v2. Small binary, low memory, instant startup.
- **Private by default** — Remote images blocked, HTML sanitized, emails rendered in sandboxed iframes. Your data stays on your machine.

---

## Features

### Email

- Multi-account support: Gmail (OAuth2 API), Microsoft/Outlook (OAuth2), and IMAP/SMTP (Yahoo, iCloud, Fastmail, and more)
- Instant account switching with per-account color indicators
- Threaded conversations with collapsible messages and arrow-key navigation
- Full-text search with Gmail-style operators (`from:`, `to:`, `subject:`, `has:attachment`, `label:`, etc.)
- Command palette (`/` or `Ctrl+K`) for quick actions
- Drag-and-drop labels, multi-select, pin threads, mute threads, context menus
- Split inbox with category tabs (Primary, Updates, Promotions, Social, Newsletters)
- Inline reply, contact sidebar with Gravatar, message view source
- Attachment library with keyboard shortcut and inline preview
- SPF/DKIM/DMARC authentication badges and warnings
- Auto-advance to next thread after archive/trash/delete

### Composer

- TipTap v3 rich text editor (bold, italic, lists, code, links, images)
- Undo send, schedule send, auto-save drafts (local + server APPEND)
- Multiple signatures with HTML source editor, reusable templates with variables
- Send-as email aliases with from-address selector
- Drag-and-drop attachments with inline preview
- Frequency-ranked contact autocomplete

### Smart Inbox

- Snooze threads with presets or custom date/time
- Filters to auto-label, archive, trash, star, or mark read
- AI + rule-based auto-categorization (Primary, Updates, Promotions, Social, Newsletters)
- AI smart labels — automatic labeling based on content
- One-click unsubscribe (RFC 8058) and subscription manager
- Newsletter bundling with delivery schedules
- Smart folders / saved searches with dynamic query tokens
- Quick steps — custom action chains for batch thread processing
- Follow-up reminders when you haven't received a reply
- Per-folder manual sync (F5 or sidebar context menu)

### Tasks

- Built-in task manager integrated with email context
- AI auto-draft replies with writing style learning
- Task tags, deadlines, and assignee tracking

### AI

Five providers with selectable models — choose one or mix and match:

| Provider | Models |
|----------|--------|
| **Anthropic Claude** | Haiku 4.5, Sonnet 4, Opus 4 |
| **OpenAI** | GPT-4o Mini, GPT-4o, GPT-4.1 Nano, GPT-4.1 Mini, GPT-4.1 |
| **Google Gemini** | 2.5 Flash, 2.5 Pro |
| **Ollama / LMStudio** | Any local model (fully private, no API key) |
| **GitHub Copilot** | GitHub Models endpoint |

Thread summaries, smart reply suggestions, AI compose & reply, text transform (improve/shorten/formalize), Ask My Inbox (natural language search), AI auto-draft with writing style learning, AI smart labels. Pick which model to use per provider in Settings. All results cached locally.

### Calendar

Google Calendar and CalDAV sync with month, week, and day views. Create, update, and respond to events without leaving Melo.

### UI & Design

- Glassmorphism with animated gradient background (reduce-motion option for accessibility)
- Dark / light / system theme with 8 accent color presets
- Flexible reading pane (right, bottom, hidden), resizable panels
- Configurable density and font scaling
- Pop-out thread windows, custom titlebar, splash screen with skeleton loading
- Reorderable and hideable sidebar navigation items
- System tray with taskbar badge count

### Privacy & Security

- OAuth PKCE for Gmail and Microsoft — no client secret, no backend servers
- Encrypted password/app-password storage for IMAP accounts (AES-256-GCM)
- Remote image blocking with per-sender allowlist
- Phishing link detection with 10 heuristic scoring rules (configurable sensitivity)
- SPF/DKIM/DMARC authentication display with badges and warnings
- DOMPurify + sandboxed iframe rendering
- AES-256-GCM encrypted token storage
- Self-signed certificate support for private IMAP/SMTP servers

### System Integration

- `mailto:` deep links, global compose shortcut
- Autostart (hidden in tray), single instance enforcement
- Auto-update via Tauri updater
- [Customizable keyboard shortcuts](docs/keyboard-shortcuts.md)

---

## Installation

Download the latest release for your platform:

**[Download Melo](https://github.com/avihaymenahem/velo/releases/latest)** — Windows `.msi` / `.exe` &nbsp;&bull;&nbsp; macOS `.dmg` &nbsp;&bull;&nbsp; Linux `.deb` / `.AppImage` / `.flatpak` / `.rpm`

No build tools or programming knowledge required — just download, install, and run.

**macOS (Homebrew):**
```bash
brew install --cask avihaymenahem/tap/velo
```

### Account setup

**Gmail:** Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/) (enable Gmail API + Calendar API), then enter your Client ID in Velo's Settings. No client secret needed (PKCE).

**Microsoft / Outlook:** Use "Add Microsoft Account" in the account switcher. OAuth2 PKCE — no app secret required.

**IMAP/SMTP:** Click "Add IMAP Account" in the account switcher. Enter your email and password — Velo auto-discovers server settings for popular providers (Outlook, Yahoo, iCloud, Fastmail, etc.). For other providers, enter IMAP/SMTP server details manually.

**AI (optional):** Add an API key for [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), or [Google Gemini](https://aistudio.google.com/) in Settings, or point Velo at a local [Ollama](https://ollama.com/) / LMStudio server for fully private AI — no API key needed.

### Building from source

```bash
git clone https://github.com/avihaymenahem/velo.git
cd velo
npm install
npm run tauri dev
```

**Prerequisites:** [Node.js](https://nodejs.org/) v18+, [Rust](https://www.rust-lang.org/tools/install), [Tauri v2 deps](https://v2.tauri.app/start/prerequisites/)

See [Development Guide](docs/development.md) for all commands, testing, and build instructions.

---

## Tech Stack

| | |
|--|--|
| **Framework** | Tauri v2 (Rust) + React 19 + TypeScript |
| **Styling** | Tailwind CSS v4 |
| **State** | Zustand 5 (9 stores) |
| **Editor** | TipTap v3 |
| **Email** | Gmail API, IMAP/SMTP (via async-imap + lettre in Rust) |
| **Database** | SQLite + FTS5 (38 tables, 27 migrations) |
| **AI** | Claude, GPT, Gemini, Ollama/LMStudio, GitHub Copilot |
| **Testing** | Vitest + Testing Library |

See [Architecture](docs/architecture.md) for detailed design, data flow, and project structure.

---

## Building

```bash
npm run tauri build
```

**Windows** `.msi` / `.exe` &nbsp;&bull;&nbsp; **macOS** `.dmg` / `.app` &nbsp;&bull;&nbsp; **Linux** `.deb` / `.AppImage` / `.flatpak` / `.rpm`

---

## License

[Apache-2.0](LICENSE)

---

<p align="center">
  Built with Rust and React.<br />
  Made by <a href="https://github.com/avihaymenahem">Avihay</a>.
</p>
