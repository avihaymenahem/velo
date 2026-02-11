import { useEffect, useState } from "react";
import { ThreadView } from "./components/email/ThreadView";
import { Composer } from "./components/composer/Composer";
import { UndoSendToast } from "./components/composer/UndoSendToast";
import { useAccountStore } from "./stores/accountStore";
import { useUIStore } from "./stores/uiStore";
import { runMigrations } from "./services/db/migrations";
import { getAllAccounts } from "./services/db/accounts";
import { getSetting } from "./services/db/settings";
import { initializeClients } from "./services/gmail/tokenManager";
import { getThreadById, getThreadLabelIds } from "./services/db/threads";
import type { Thread } from "./stores/threadStore";

export default function ThreadWindow() {
  const { setTheme } = useUIStore();
  const { setAccounts } = useAccountStore();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const threadId = params.get("thread");
    const accountId = params.get("account");

    if (!threadId || !accountId) {
      setError("Missing thread or account parameter");
      setLoading(false);
      return;
    }

    async function init() {
      try {
        await runMigrations();

        // Restore theme
        const savedTheme = await getSetting("theme");
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setTheme(savedTheme);
        }

        // Load accounts into store
        const dbAccounts = await getAllAccounts();
        const mapped = dbAccounts.map((a) => ({
          id: a.id,
          email: a.email,
          displayName: a.display_name,
          avatarUrl: a.avatar_url,
          isActive: a.is_active === 1,
        }));
        setAccounts(mapped);

        // Initialize Gmail clients
        await initializeClients();

        // Fetch thread
        const dbThread = await getThreadById(accountId!, threadId!);
        if (!dbThread) {
          setError("Thread not found");
          setLoading(false);
          return;
        }

        const labelIds = await getThreadLabelIds(accountId!, threadId!);
        setThread({
          id: dbThread.id,
          accountId: dbThread.account_id,
          subject: dbThread.subject,
          snippet: dbThread.snippet,
          lastMessageAt: dbThread.last_message_at ?? 0,
          messageCount: dbThread.message_count,
          isRead: dbThread.is_read === 1,
          isStarred: dbThread.is_starred === 1,
          isPinned: dbThread.is_pinned === 1,
          hasAttachments: dbThread.has_attachments === 1,
          labelIds,
          fromName: dbThread.from_name,
          fromAddress: dbThread.from_address,
        });
      } catch (err) {
        console.error("Failed to initialize thread window:", err);
        setError("Failed to load thread");
      }
      setLoading(false);
    }

    init();
  }, [setTheme, setAccounts]);

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary text-text-secondary">
        <span className="text-sm">Loading thread...</span>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary text-text-secondary">
        <span className="text-sm">{error ?? "Thread not found"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary">
      <ThreadView thread={thread} />
      <Composer />
      <UndoSendToast />
    </div>
  );
}
