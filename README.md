<p align="center">
  <img src="assets/icon.png?v1" alt="Kirje" width="200" height="200" style="border-radius: 24px;" />
</p>

<h1 align="center">Kirje</h1>

<p align="center">
  <strong>A local-first follow-up assistant for email.</strong>
</p>

<p align="center">
  Kirje helps you track what you need to reply to, who has not replied to you, and what is due soon across your inboxes.<br />
  Your mail stays local. AI is optional and uses the provider you configure.
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

## Why Kirje?

Most email clients optimize the inbox. Kirje optimizes the moment email becomes responsibility:

- **Follow-up first** -- Threads can carry explicit work states such as Needs Reply, Waiting, Committed, Decision, Can Archive, and Done.
- **Local-first** -- Your emails live in a local SQLite database. No Kirje cloud mailbox copy. Read your mail offline.
- **BYOK AI** -- Summaries, drafts, search, and extraction run through the AI provider you configure.
- **Full email client underneath** -- Gmail API and IMAP/SMTP support, search, labels, composer, calendar, tasks, attachments, and offline-aware actions.
- **Native performance** -- Rust backend via Tauri v2. Small binary, low memory, instant startup.
- **Private by default** -- Remote images blocked, HTML sanitized, emails rendered in sandboxed iframes. Mail is stored locally; optional AI calls go directly to the provider you configure.

---

## Features

### Follow-up Assistant

- Work states for email threads: Needs Reply, Waiting, Committed, Decision, Can Archive, Done
- Command palette actions to manually mark thread state without network access
- Follow-up reminders when you have not received a reply
- Task extraction from emails, with due dates and priorities
- Product roadmap focused on Today, Needs Reply, Waiting, and Due Soon queues

### Email

- Multi-account support: Gmail (API) and IMAP/SMTP (Outlook, Yahoo, iCloud, Fastmail, and more) with instant switching
- Threaded conversations with collapsible messages
- Full-text search with Gmail-style operators (`from:`, `to:`, `subject:`, `has:attachment`, `label:`, etc.)
- Command palette (`/` or `Ctrl+K`) for quick actions
- Drag-and-drop labels, multi-select, pin threads, mute threads, context menus
- Split inbox with category tabs (Primary, Updates, Promotions, Social, Newsletters)
- Inline reply, contact sidebar with Gravatar

### Composer

- TipTap v3 rich text editor (bold, italic, lists, code, links, images)
- Undo send, schedule send, auto-save drafts
- Multiple signatures, reusable templates with variables
- Send-as email aliases with from-address selector
- Drag-and-drop attachments with inline preview
- Frequency-ranked contact autocomplete

### Smart Inbox

- Snooze threads with presets or custom date/time
- Filters to auto-label, archive, trash, star, or mark read
- AI + rule-based auto-categorization (Primary, Updates, Promotions, Social, Newsletters)
- One-click unsubscribe (RFC 8058) and subscription manager
- Newsletter bundling with delivery schedules
- Smart folders / saved searches with dynamic query tokens
- Quick steps -- custom action chains for batch thread processing
- Follow-up reminders when you haven't received a reply

### AI

Three providers with selectable models -- choose one or mix and match:

| Provider | Models |
|----------|--------|
| **Anthropic Claude** | Haiku 4.5, Sonnet 4, Opus 4 |
| **OpenAI** | GPT-4o Mini, GPT-4o, GPT-4.1 Nano, GPT-4.1 Mini, GPT-4.1 |
| **Google Gemini** | 2.5 Flash, 2.5 Pro |

Thread summaries, smart reply suggestions, AI compose & reply, text transform (improve/shorten/formalize), Ask My Inbox (natural language search). Pick which model to use per provider in Settings. All results cached locally.

### Calendar

Google Calendar sync with month, week, and day views. Create events without leaving Kirje.

### UI & Design

- Glassmorphism with animated gradient background
- Dark / light / system theme with 8 accent color presets
- Flexible reading pane (right, bottom, hidden), resizable panels
- Configurable density and font scaling
- Pop-out thread windows, custom titlebar, splash screen
- System tray with taskbar badge count

### Privacy & Security

- OAuth PKCE for Gmail -- no client secret, no backend servers
- Encrypted password/app-password storage for IMAP accounts (AES-256-GCM)
- Remote image blocking with per-sender allowlist
- Phishing link detection with 10 heuristic scoring rules
- SPF/DKIM/DMARC authentication display with badges and warnings
- DOMPurify + sandboxed iframe rendering
- AES-256-GCM encrypted token storage

### System Integration

- `mailto:` deep links, global compose shortcut
- Autostart (hidden in tray), single instance
- [Customizable keyboard shortcuts](docs/keyboard-shortcuts.md)

---

## Installation

Download the latest release for your platform:

**[Download Kirje](https://github.com/iiwish/kirje/releases/latest)** -- Windows `.msi` / `.exe` &nbsp;&bull;&nbsp; macOS `.dmg` &nbsp;&bull;&nbsp; Linux `.deb` / `.AppImage`

No build tools or programming knowledge required -- just download, install, and run.

### Account setup

**Gmail:** Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/) (enable Gmail API + Calendar API), then enter your Client ID in Kirje's Settings. No client secret needed (PKCE).

**IMAP/SMTP:** Click "Add IMAP Account" in the account switcher. Enter your email and password -- Kirje auto-discovers server settings for popular providers (Outlook, Yahoo, iCloud, Fastmail, etc.). For other providers, enter IMAP/SMTP server details manually. No Google Cloud project needed.

**AI (optional):** Add an API key for [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), or [Google Gemini](https://aistudio.google.com/) in Settings. Then select which model to use for each provider.

### Building from source

For developers who want to build Kirje themselves or contribute:

```bash
git clone https://github.com/iiwish/kirje.git
cd kirje
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
| **State** | Zustand 5 (8 stores) |
| **Editor** | TipTap v3 |
| **Email** | Gmail API, IMAP/SMTP (via async-imap + lettre in Rust) |
| **Database** | SQLite + FTS5 (33 tables) |
| **AI** | Claude, GPT, Gemini |
| **Testing** | Vitest + Testing Library |

See [Architecture](docs/architecture.md) for detailed design, data flow, and project structure.

---

## Building

```bash
npm run tauri build
```

**Windows** `.msi` / `.exe` &nbsp;&bull;&nbsp; **macOS** `.dmg` / `.app` &nbsp;&bull;&nbsp; **Linux** `.deb` / `.AppImage`

---

## License

[Apache-2.0](LICENSE)

---

<p align="center">
  Built with Rust and React.<br />
  Maintained by Kirje contributors.
</p>
