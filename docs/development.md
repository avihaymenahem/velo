# Development

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- Tauri v2 system dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

## Commands

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

# Type-check (all TypeScript errors)
npx tsc --noEmit

# Build for production
npm run tauri build

# Rust only (from src-tauri/)
cd src-tauri && cargo check
```

## Testing

- **Framework:** Vitest + jsdom
- **Setup:** `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`)
- **Config:** `globals: true` -- no imports needed for `describe`, `it`, `expect`
- **Location:** Tests are colocated with source files (e.g., `uiStore.test.ts` next to `uiStore.ts`)
- **Count:** 142 test files, 1,659 tests passing (84 TS + 7 Rust). Organized across stores (8), services (70), utils (14), components (32), constants (3), router (1), hooks (2), and config (1)

### Zustand test pattern

```ts
beforeEach(() => {
  useStore.setState(initialState);
});

it('does something', () => {
  useStore.getState().someAction();
  expect(useStore.getState().value).toBe(expected);
});
```

## Building

```bash
# Build for your current platform
npm run tauri build
```

Produces native installers:
- **Windows** -- `.msi` / `.exe`
- **macOS** -- `.dmg` / `.app`
- **Linux** -- `.deb` / `.AppImage`

## Demo/Mailtrap Testing

The project includes pre-configured Mailtrap credentials for testing email functionality:

```
VITE_DEMO_EMAIL=demo@mailtrap.io
VITE_DEMO_IMAP_HOST=sandbox.smtp.mailtrap.io
VITE_DEMO_IMAP_PORT=993
VITE_DEMO_SMTP_HOST=sandbox.smtp.mailtrap.io
VITE_DEMO_SMTP_PORT=465
```

Copy `.env.example` to `.env` to enable demo mode with Mailtrap sandbox SMTP/IMAP for testing sends and receives without real email delivery.

## Email Account Setup

### Gmail (OAuth)

Velo connects directly to Gmail via OAuth. You need your own Google Cloud credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Gmail API** and **Google Calendar API**
4. Create OAuth 2.0 credentials (Desktop application)
5. In Velo's Settings, enter your Client ID

> Velo uses PKCE flow -- no client secret is required. **Note:** If using a custom OAuth app, ensure your Client ID is saved in Settings.

### IMAP/SMTP

For non-Gmail providers (Outlook, Yahoo, iCloud, Fastmail, etc.):

1. Click the account switcher in the sidebar → **Add IMAP Account**
2. Enter your email address and password (or app-password)
3. Velo auto-discovers server settings for well-known providers
4. For other providers, enter IMAP/SMTP host, port, and security manually
5. Test connection, then save

> No Google Cloud project or Client ID needed. Passwords are encrypted with AES-256-GCM in the local database. Some providers (e.g., Gmail, Yahoo) require an app-specific password instead of your main password.

## AI Setup (Optional)

To enable AI features, add your API key for one or more providers in Settings:

- **Anthropic Claude** -- [Get API key](https://console.anthropic.com/) -- Haiku 4.5 (default), Sonnet 4, Opus 4
- **OpenAI** -- [Get API key](https://platform.openai.com/) -- GPT-4o Mini (default), GPT-4o, GPT-4.1 series
- **Google Gemini** -- [Get API key](https://aistudio.google.com/) -- 2.5 Flash (default), 2.5 Pro
- **Custom (OpenAI-compatible)** -- Any OpenAI-compatible API (e.g., local Ollama, LM Studio)

After adding an API key, select which model to use for each provider in Settings > AI.

## Known Issues (v0.5.0)

- **Rust `cargo build` failure** — MinGW/dlltool issues on Windows. Code is structurally correct (passes `tsc --noEmit` + `vitest`). Fix by installing proper MSVC toolchain.
  - **Workaround:** Use `npm run tauri dev` for development; use WSL or a Linux VM for production builds.
