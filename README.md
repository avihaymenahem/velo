<p align="center">
  <img src="assets/icon.png" alt="Velo" width="200" height="200" style="border-radius: 24px;" />
</p>

<h1 align="center">Velo</h1>

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
  <a href="#keyboard-shortcuts">Shortcuts</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#ai-features">AI</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#architecture">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#development">Development</a>
</p>

---

## Why Velo?

Most email clients are slow, bloated, or send your data to someone else's server. Velo is different:

- **Local-first** -- Your emails live in a local SQLite database. No middleman servers. Read your mail offline.
- **Keyboard-driven** -- Superhuman-inspired shortcuts let you fly through your inbox without touching the mouse.
- **AI-enhanced** -- Summarize threads, generate replies, and search your inbox in natural language -- with your choice of AI provider.
- **Native performance** -- Rust backend via Tauri v2. Small binary, low memory, instant startup.
- **Private by default** -- Remote images blocked, HTML sanitized, emails rendered in sandboxed iframes. Your data stays on your machine.

---

## Features

### Core Email

- **Multi-account Gmail** -- Add multiple accounts and switch between them instantly
- **Threaded conversations** -- Gmail-style threads with collapsible messages
- **Unified inbox** -- View all accounts at once or filter by account
- **Full-text search** -- FTS5 trigram search with Gmail-style operators (`from:`, `to:`, `subject:`, `has:attachment`, `is:unread`, `before:`, `after:`, `label:`)
- **Command palette** -- Quick search and actions with `/` or `Ctrl+K`
- **Drag-and-drop labels** -- Drag threads onto sidebar labels to organize
- **Multi-select** -- Click and Shift+click for batch operations
- **Pin threads** -- Keep important conversations at the top

### Rich Composer

- **TipTap v3 editor** -- Bold, italic, underline, headings, lists, blockquotes, code blocks, links, images
- **Undo send** -- Configurable delay (default 5s) to cancel outgoing mail
- **Schedule send** -- Pick a time or choose presets (later today, tomorrow, next week)
- **Auto-save drafts** -- Saves to Gmail drafts every 3 seconds
- **Signatures** -- Multiple signatures per account with default selection
- **Templates** -- Reusable templates with variables (`{{recipientEmail}}`, `{{senderName}}`, etc.) and keyboard shortcuts for instant insertion
- **Drag-and-drop attachments** -- Drop files directly into the composer
- **Contact autocomplete** -- Frequency-ranked suggestions as you type

### Smart Inbox

- **Snooze** -- Hide emails until later with presets or a custom date/time
- **Filters** -- Auto-apply rules to incoming mail (label, archive, trash, star, mark read)
- **Auto-categorization** -- AI sorts threads into Primary, Updates, Promotions, Social, Newsletters
- **One-click unsubscribe** -- Detects `List-Unsubscribe` headers for instant cleanup
- **Spam management** -- Report spam or mark as not spam with a single key

### AI Features

Velo supports **three AI providers** -- choose the one you prefer:

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude |
| **OpenAI** | GPT |
| **Google** | Gemini |

- **Thread summaries** -- Auto-generate summaries for long conversations
- **Smart reply** -- Get 3 contextual reply suggestions per thread
- **AI compose** -- Describe what you want to say, get a full draft
- **AI reply** -- Generate replies with optional custom instructions
- **Text transform** -- Improve, shorten, or formalize selected text
- **Ask My Inbox** -- Natural language questions across your entire mailbox
- **Local caching** -- AI results cached locally to reduce API costs

### Calendar

- **Google Calendar sync** -- View events in month, week, or day view
- **Create events** -- Add new events without leaving Velo
- **Event details** -- View attendees, location, and description

### UI & Design

- **Glassmorphism** -- Modern glass panels with animated gradient background
- **Dark mode** -- System-aware or manual toggle (light / dark / system)
- **Flexible layout** -- Reading pane: right, bottom, or hidden
- **Resizable panels** -- Drag to resize the email list
- **Pop-out threads** -- Open any thread in its own window
- **Custom titlebar** -- Clean, native-feeling design
- **System tray** -- Minimize to tray, check mail from tray menu

### Security & Privacy

- **OAuth PKCE** -- Secure authentication without a client secret
- **Remote image blocking** -- Tracking pixels blocked by default, per-sender allowlist
- **HTML sanitization** -- DOMPurify + sandboxed iframe rendering
- **Encrypted token storage** -- AES-256-GCM encryption for sensitive data
- **No backend servers** -- Direct Gmail API communication, nothing passes through third parties

---

## Keyboard Shortcuts

Velo is designed to be used entirely from the keyboard.

### Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous thread |
| `o` or `Enter` | Open thread |
| `Escape` | Close composer / clear selection / deselect |
| `g` then `i` | Go to Inbox |
| `g` then `s` | Go to Starred |
| `g` then `t` | Go to Sent |
| `g` then `d` | Go to Drafts |

### Actions

| Key | Action |
|-----|--------|
| `c` | Compose new email |
| `r` | Reply |
| `a` | Reply all |
| `f` | Forward |
| `e` | Archive |
| `s` | Star / unstar |
| `p` | Pin / unpin |
| `#` | Trash (permanent delete if already in trash) |
| `!` | Spam / not spam |
| `u` | Unsubscribe |
| `Ctrl+Enter` | Send email |

### App

| Key | Action |
|-----|--------|
| `/` or `Ctrl+K` | Command palette |
| `?` | Keyboard shortcuts help |
| `Ctrl+Shift+E` | Toggle sidebar |
| `Ctrl+A` | Select all threads |

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- Tauri v2 system dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Setup

```bash
# Clone the repository
git clone https://github.com/avihaymenahem/velo.git
cd velo

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Gmail OAuth Setup

Velo connects directly to Gmail via OAuth. You need your own Google Cloud credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Gmail API** and **Google Calendar API**
4. Create OAuth 2.0 credentials (Desktop application)
5. In Velo's Settings, enter your Client ID

> **Note:** Velo uses PKCE flow -- no client secret is required for the app itself.

### AI Setup (Optional)

To enable AI features, add your API key for one or more providers in Settings:

- **Anthropic** -- [Get API key](https://console.anthropic.com/)
- **OpenAI** -- [Get API key](https://platform.openai.com/)
- **Google Gemini** -- [Get API key](https://aistudio.google.com/)

---

## Architecture

Velo follows a **three-layer architecture** with clear separation of concerns:

```
+--------------------------+
|     React 19 + Zustand   |   UI Layer
|  Components + 5 Stores   |   (TypeScript)
+--------------------------+
|     Service Layer         |   Business Logic
|  Gmail / DB / AI / Sync  |   (TypeScript)
+--------------------------+
|     Tauri v2 + Rust       |   Native Layer
|  System Tray / OAuth /    |   (Rust)
|  SQLite / Notifications   |
+--------------------------+
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Tauri v2](https://v2.tauri.app/) |
| **Frontend** | React 19, TypeScript, Zustand 5 |
| **Styling** | Tailwind CSS v4 |
| **Editor** | TipTap v3 |
| **Backend** | Rust |
| **Database** | SQLite (via tauri-plugin-sql) |
| **Search** | FTS5 with trigram tokenizer |
| **Icons** | Lucide React |
| **Drag & Drop** | @dnd-kit |
| **Testing** | Vitest + Testing Library |

### Data Flow

1. **Sync** -- Background sync every 60s via Gmail History API (delta sync). Falls back to full sync if history expires (~30 days).
2. **Storage** -- All messages, threads, labels, and contacts stored in local SQLite with FTS5 full-text indexing.
3. **State** -- Five Zustand stores manage UI state. No middleware, no persistence needed -- ephemeral state rebuilds from SQLite on startup.
4. **Rendering** -- Email HTML is sanitized with DOMPurify and rendered in sandboxed iframes. Remote images blocked by default.

---

## Development

```bash
# Start Tauri dev (frontend + backend)
npm run tauri dev

# Vite dev server only (no Tauri)
npm run dev

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npx vitest run src/stores/uiStore.test.ts

# Type-check
npx tsc --noEmit

# Build for production
npm run tauri build

# Rust only (from src-tauri/)
cd src-tauri && cargo build
```

### Project Structure

```
velo/
├── src/
│   ├── components/         # React components (10 groups, ~38 files)
│   │   ├── layout/         # Sidebar, EmailList, ReadingPane, TitleBar
│   │   ├── email/          # ThreadView, MessageItem, EmailRenderer
│   │   ├── composer/       # Composer, AddressInput, EditorToolbar
│   │   ├── search/         # CommandPalette, SearchBar, ShortcutsHelp
│   │   ├── settings/       # SettingsPage, FilterEditor, LabelEditor
│   │   ├── accounts/       # AddAccount, AccountSwitcher
│   │   ├── calendar/       # CalendarView, EventDetails
│   │   └── ui/             # EmptyState, Skeleton
│   ├── services/           # Business logic layer
│   │   ├── db/             # SQLite queries, migrations, FTS5
│   │   ├── gmail/          # GmailClient, tokenManager, syncManager
│   │   ├── composer/       # Draft auto-save
│   │   ├── search/         # Query parser, SQL builder
│   │   ├── filters/        # Auto-apply filter engine
│   │   └── snooze/         # Background snooze/schedule checkers
│   ├── stores/             # Zustand stores (ui, account, thread, composer, label)
│   └── styles/             # Tailwind CSS v4 globals
├── src-tauri/
│   ├── src/                # Rust backend (tray, OAuth, window management)
│   ├── capabilities/       # Tauri v2 permissions
│   └── icons/              # App icons (all platforms)
├── package.json
└── CLAUDE.md               # AI coding assistant context
```

---

## Building

```bash
# Build for your current platform
npm run tauri build
```

Produces native installers:
- **Windows** -- `.msi` / `.exe`
- **macOS** -- `.dmg` / `.app`
- **Linux** -- `.deb` / `.AppImage`

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with Rust and React.<br />
  Made by <a href="https://github.com/avihaymenahem">Avihay</a>.
</p>
