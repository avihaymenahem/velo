import { useEffect, useState } from "react";
import { Composer } from "./components/composer/Composer";
import { UndoSendToast } from "./components/composer/UndoSendToast";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { useAccountStore } from "./stores/accountStore";
import { useComposerStore } from "./stores/composerStore";
import { useUIStore } from "./stores/uiStore";
// import { runMigrations } from "./services/db/migrations";
import { getAllAccounts } from "./services/db/accounts";
import { getSetting, deleteSetting } from "./services/db/settings";
import { initializeClients } from "./services/gmail/tokenManager";
import { getThemeById, COLOR_THEMES } from "./constants/themes";
import type { ColorThemeId } from "./constants/themes";
import type { ComposerMode } from "./stores/composerStore";
import { saveNow, getIsDiscarding } from "./services/composer/draftAutoSave";

export default function ComposerWindow() {
  const { setTheme, setFontScale, setColorTheme, setComposerFontFamily, setComposerFontSize } = useUIStore();
  const { setAccounts } = useAccountStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    async function init() {
      try {
        // Restore theme
        const savedTheme = await getSetting("theme");
        if (
          savedTheme === "light" ||
          savedTheme === "dark" ||
          savedTheme === "system"
        ) {
          setTheme(savedTheme);
        }

        // Restore font scale
        const savedFontScale = await getSetting("font_size");
        if (
          savedFontScale === "small" ||
          savedFontScale === "default" ||
          savedFontScale === "large" ||
          savedFontScale === "xlarge"
        ) {
          setFontScale(savedFontScale);
        }

        // Restore color theme
        const savedColorTheme = await getSetting("color_theme");
        if (
          savedColorTheme &&
          COLOR_THEMES.some((t) => t.id === savedColorTheme)
        ) {
          setColorTheme(savedColorTheme as ColorThemeId);
        }

        // Restore composer font family
        const savedComposerFont = await getSetting("composer_font_family");
        if (
          savedComposerFont === "system" ||
          savedComposerFont === "arial" ||
          savedComposerFont === "calibri" ||
          savedComposerFont === "times" ||
          savedComposerFont === "courier" ||
          savedComposerFont === "georgia" ||
          savedComposerFont === "verdana" ||
          savedComposerFont === "avenir" ||
          savedComposerFont === "inter"
        ) {
          setComposerFontFamily(savedComposerFont);
        }

        // Restore composer font size
        const savedComposerSize = await getSetting("composer_font_size");
        if (
          savedComposerSize === "10px" ||
          savedComposerSize === "12px" ||
          savedComposerSize === "14px" ||
          savedComposerSize === "16px" ||
          savedComposerSize === "18px" ||
          savedComposerSize === "20px" ||
          savedComposerSize === "24px"
        ) {
          setComposerFontSize(savedComposerSize);
        }

        // Load accounts into store
        const dbAccounts = await getAllAccounts();
        const mapped = dbAccounts.map((a) => ({
          id: a.id,
          email: a.email,
          displayName: a.display_name,
          avatarUrl: a.avatar_url,
          isActive: a.is_active === 1,
          provider: a.provider,
          color: a.color ?? null,
          includeInGlobal: a.include_in_global !== 0,
          sortOrder: a.sort_order ?? 0,
          label: a.label ?? null,
        }));
        const savedAccountId = await getSetting("active_account_id");
        setAccounts(mapped, savedAccountId);

        // Initialize Gmail clients
        await initializeClients();

// Parse composer state from URL params (primary source — always reliable)
         const windowLabel = params.get("windowLabel");
         const mode = (params.get("mode") as ComposerMode) ?? "new";
         const to = params.get("to")?.split(",").filter(Boolean) ?? [];
         const cc = params.get("cc")?.split(",").filter(Boolean) ?? [];
         const bcc = params.get("bcc")?.split(",").filter(Boolean) ?? [];
         const subject = params.get("subject") ?? "";
         const threadId = params.get("threadId") ?? null;
         const inReplyToMessageId = params.get("inReplyToMessageId") ?? null;
         const draftId = params.get("draftId") ?? null;
         const fromEmail = params.get("fromEmail");
         const accountId = params.get("accountId");

         // quotedHtml is passed via SQLite (too large for URL, localStorage not shared across windows)
         let quotedHtml = "";
         let bodyHtml = "";
         if (windowLabel) {
           const payloadKey = `__composer_payload_${windowLabel}`;
           const raw = await getSetting(payloadKey);
           if (raw) {
             try {
               const payload = JSON.parse(raw);
               if (payload.quotedHtml) quotedHtml = payload.quotedHtml;
               if (payload.bodyHtml) bodyHtml = payload.bodyHtml;
             } catch { /* ignore */ }
             await deleteSetting(payloadKey);
           }
         }

        if (fromEmail) {
          useComposerStore.getState().setFromEmail(fromEmail);
        }

        // Lock composerAccountId so effectiveAccountId is deterministic for the
        // entire lifetime of this window — prevents tombstone/delete mismatch when
        // the composer window has no explicit accountId in the URL (e.g. keyboard
        // shortcut, command palette) and activeAccountId would be stale or null.
        // We pass it into opts so openComposer() sets composerAccountId atomically
        // (it would otherwise reset it to null if opts.accountId is undefined).
        const resolvedAccountId = accountId ?? savedAccountId ?? undefined;

        const opts = { mode, to, cc, bcc, subject, bodyHtml, quotedHtml, threadId, inReplyToMessageId, draftId, accountId: resolvedAccountId };

        // Open composer with parsed state
        useComposerStore.getState().openComposer(opts);

        useComposerStore.getState().setViewMode("fullpage");
      } catch (err) {
        console.error("Failed to initialize composer window:", err);
        setError("Failed to load composer");
      }
      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store setters are stable references
  }, []);

  const isOpen = useComposerStore((s) => s.isOpen);

  useEffect(() => {
    if (!loading && !isOpen) {
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => {
          getCurrentWindow().close();
        })
        .catch((err) => console.error("Failed to close window", err));
    }
  }, [isOpen, loading]);

  // Sync theme class to <html>
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        if (mq.matches) root.classList.add("dark");
        else root.classList.remove("dark");
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // Sync font-scale class to <html>
  const fontScale = useUIStore((s) => s.fontScale);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      "font-scale-small",
      "font-scale-default",
      "font-scale-large",
      "font-scale-xlarge",
    );
    root.classList.add(`font-scale-${fontScale}`);
  }, [fontScale]);

  // Apply color theme CSS custom properties to <html>
  const colorTheme = useUIStore((s) => s.colorTheme);
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const themeData = getThemeById(colorTheme);
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      const colors = isDark ? themeData.dark : themeData.light;
      root.style.setProperty("--color-accent", colors.accent);
      root.style.setProperty("--color-accent-hover", colors.accentHover);
      root.style.setProperty("--color-accent-light", colors.accentLight);
      root.style.setProperty("--color-bg-selected", colors.bgSelected);
      root.style.setProperty("--color-sidebar-active", colors.sidebarActive);
    };

    apply();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [colorTheme, theme]);

  // Save draft when user closes the window via OS (Cmd+W / ✕ button)
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => {
      const win = getCurrentWebviewWindow();
      win.onCloseRequested(async (event) => {
        if (!useComposerStore.getState().isOpen) return;
        // If handleDiscard() is already running let the OS close proceed so the
        // user is never permanently stuck. The 6-second timeout in handleDiscard
        // covers normal cases; the OS button is the emergency escape hatch.
        if (getIsDiscarding()) return;
        event.preventDefault();
        await saveNow();
        await win.destroy();
      }).then((fn) => { unlisten = fn; });
    }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary text-text-secondary">
        <span className="text-sm">Loading composer...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary text-text-secondary">
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0">
        <ErrorBoundary name="Composer">
          <Composer />
        </ErrorBoundary>
      </div>
      <UndoSendToast />
    </div>
  );
}
