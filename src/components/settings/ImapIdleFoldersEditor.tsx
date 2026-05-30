import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { t } from "@/i18n";

import { getLabelsForAccount } from "@/services/db/labels";
import {
  getIdleFoldersForAccount,
  setIdleFoldersForAccount,
  stopIdleForAccount,
  startIdleForAccount,
  isIdleEnabled,
} from "@/services/imap/imapIdleManager";

interface Props {
  accountId: string;
}

interface FolderRow {
  path: string;
  displayName: string;
}

/**
 * Compact per-account picker for which IMAP folders run with IDLE (push).
 * Folders not selected fall back to the normal 60 s polling cycle.
 */
export function ImapIdleFoldersEditor({ accountId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const labels = await getLabelsForAccount(accountId);
      const rows: FolderRow[] = labels
        .filter((l) => l.imap_folder_path)
        .map((l) => ({
          path: l.imap_folder_path as string,
          displayName: l.name,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      const current = await getIdleFoldersForAccount(accountId);
      const enabled = await isIdleEnabled();
      if (cancelled) return;
      // INBOX is always available even if labels haven't been synced yet
      if (!rows.some((r) => r.path === "INBOX")) {
        rows.unshift({ path: "INBOX", displayName: "INBOX" });
      }
      setFolders(rows);
      setSelected(new Set(current));
      setGlobalEnabled(enabled);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, expanded]);

  const toggle = async (path: string) => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    // Always keep at least INBOX so push is meaningful
    if (next.size === 0) next.add("INBOX");
    setSelected(next);

    const list = [...next];
    await setIdleFoldersForAccount(accountId, list);
    // Restart the watchers so the new folder set takes effect immediately
    if (globalEnabled) {
      await stopIdleForAccount(accountId);
      await startIdleForAccount(accountId);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {t("imapIdle.pushIdleFolders")}
        {!globalEnabled && expanded && (
          <span className="ml-2 text-[0.65rem] text-text-tertiary">
            {t("imapIdle.globalDisabledNote")}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 pl-4 space-y-1">
          {loading && (
            <div className="text-xs text-text-tertiary">{t("imapIdle.loadingFolders")}</div>
          )}
          {!loading && folders.length === 0 && (
            <div className="text-xs text-text-tertiary">
              {t("imapIdle.noFoldersSync")}
            </div>
          )}
          {!loading &&
            folders.map((f) => (
              <label
                key={f.path}
                className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(f.path)}
                  onChange={() => toggle(f.path)}
                  className="rounded border-border-primary"
                />
                <span className="truncate">{f.displayName}</span>
                {f.path !== f.displayName && (
                  <span className="text-text-tertiary truncate">
                    ({f.path})
                  </span>
                )}
              </label>
            ))}
          {!loading && folders.length > 0 && (
            <p className="text-[0.65rem] text-text-tertiary mt-2">
              {t("imapIdle.selectedDesc")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
