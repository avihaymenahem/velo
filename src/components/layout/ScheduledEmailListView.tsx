import { useEffect, useState, useCallback } from "react";
import { Clock, Trash2, Paperclip } from "lucide-react";
import {
  getScheduledEmailsByAccounts,
  getScheduledEmailsForAccount,
  updateScheduledEmailStatus,
  updateScheduledTime,
  type DbScheduledEmail,
} from "@/services/db/scheduledEmails";
import { useAccountStore, type Account } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { useLabelStore } from "@/stores/labelStore";
import { useComposerStore } from "@/stores/composerStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduledEmptyIllustration } from "@/components/ui/illustrations";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { getSchedulePresets } from "@/utils/schedulePresets";
import { t } from "@/i18n";

interface ScheduledEmailListViewProps {
  accountId: string | null;
}

function formatScheduledAt(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const timeStr = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return t("layout.scheduledPanel.todayAt", { time: timeStr });
  if (isTomorrow) return t("layout.scheduledPanel.tomorrowAt", { time: timeStr });
  return (
    date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    }) +
    " at " +
    timeStr
  );
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? div.innerText ?? "";
}

function ScheduledItem({
  email,
  account,
  isSelected,
  onClick,
  onCancelQuick,
  onContextMenu,
}: {
  email: DbScheduledEmail;
  account: Account | null;
  isSelected: boolean;
  onClick: () => void;
  onCancelQuick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, email: DbScheduledEmail) => void;
}) {
  const emailDensity = useUIStore((s) => s.emailDensity);
  const recipients = email.to_addresses
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const bodyPreview = stripHtml(email.body_html).trim().split("\n").find((l) => l.trim()) ?? "";

  const accountColor = account?.color ?? "#3182CE";
  const accountInitial = (account?.email?.[0] ?? "?").toUpperCase();

  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, email); }}
      className={`relative flex items-start gap-3 px-4 py-3 border-b border-border-secondary cursor-pointer transition-colors ${
        isSelected ? "bg-accent/10" : "hover:bg-bg-hover"
      }`}
    >
      {/* Account color stripe */}
      <span
        className="absolute left-0 top-0 -bottom-px w-0.5"
        style={{ backgroundColor: accountColor }}
      />

      {/* Account badge */}
      <div
        className={`rounded-full flex items-center justify-center shrink-0 font-medium text-white mt-0.5 bg-accent ${
          emailDensity === "compact" ? "w-7 h-7 text-xs" : emailDensity === "spacious" ? "w-10 h-10 text-sm" : "w-9 h-9 text-sm"
        }`}
      >
        {accountInitial}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-secondary truncate">
          {recipients.join(", ")}
        </div>
        <div className="text-sm text-text-secondary truncate mt-0.5">
          {email.subject || t("composer.noSubject")}
        </div>
        <div className={`flex items-center gap-1.5 mt-0.5 ${emailDensity === "compact" ? "hidden" : ""}`}>
          <span className="text-xs text-text-tertiary truncate flex-1">
            {bodyPreview}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Clock size={11} className="text-accent shrink-0" />
          <span className="text-xs text-accent">
            {formatScheduledAt(email.scheduled_at)}
          </span>
          {email.attachment_paths && (
            <Paperclip size={11} className="text-text-tertiary shrink-0" />
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={onCancelQuick}
        className="p-1.5 rounded hover:bg-danger/10 text-text-tertiary hover:text-danger transition-colors shrink-0"
        title={t("layout.scheduledPanel.cancelSchedule")}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function ScheduledEmailListView({ accountId }: ScheduledEmailListViewProps) {
  const [emails, setEmails] = useState<DbScheduledEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [reschedulingEmail, setReschedulingEmail] = useState<DbScheduledEmail | null>(null);

  const accounts = useAccountStore((s) => s.accounts);
  const selectedScheduledEmail = useUIStore((s) => s.selectedScheduledEmail);
  const setSelectedScheduledEmail = useUIStore((s) => s.setSelectedScheduledEmail);
  const refreshScheduledCounts = useLabelStore((s) => s.refreshScheduledCounts);
  const openComposer = useComposerStore((s) => s.openComposer);
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const load = useCallback(async () => {
    try {
      let items: DbScheduledEmail[];
      if (accountId) {
        items = await getScheduledEmailsForAccount(accountId);
      } else {
        const allIds = accounts.map((a) => a.id);
        items = await getScheduledEmailsByAccounts(allIds);
      }
      setEmails(items);
    } catch (err) {
      console.error("Failed to load scheduled emails:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, accounts]);

  useEffect(() => {
    load();
    const syncHandler = () => { load(); };
    const removeHandler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setEmails((prev) => prev.filter((em) => em.id !== id));
    };
    window.addEventListener("velo-sync-done", syncHandler);
    window.addEventListener("velo-scheduled-removed", removeHandler);
    return () => {
      window.removeEventListener("velo-sync-done", syncHandler);
      window.removeEventListener("velo-scheduled-removed", removeHandler);
    };
  }, [load]);

  useEffect(() => {
    return () => { setSelectedScheduledEmail(null); };
  }, [setSelectedScheduledEmail]);

  const handleCancelQuick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await updateScheduledEmailStatus(id, "cancelled");
    setEmails((prev) => prev.filter((em) => em.id !== id));
    if (selectedScheduledEmail?.id === id) setSelectedScheduledEmail(null);
    refreshScheduledCounts(accounts.map((a) => a.id)).catch(console.error);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, email: DbScheduledEmail) => {
    openMenu("scheduledEmail", { x: e.clientX, y: e.clientY }, { email });
  }, [openMenu]);

  const handleContextEdit = useCallback((email: DbScheduledEmail) => {
    const to = email.to_addresses.split(",").map((s) => s.trim()).filter(Boolean);
    const cc = email.cc_addresses ? email.cc_addresses.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const bcc = email.bcc_addresses ? email.bcc_addresses.split(",").map((s) => s.trim()).filter(Boolean) : [];
    openComposer({ mode: "new", to, cc, bcc, subject: email.subject ?? "", bodyHtml: email.body_html, threadId: email.thread_id, accountId: email.account_id });
    updateScheduledEmailStatus(email.id, "cancelled")
      .then(() => refreshScheduledCounts(accounts.map((a) => a.id)))
      .catch(console.error);
    window.dispatchEvent(new CustomEvent("velo-scheduled-removed", { detail: { id: email.id } }));
    if (selectedScheduledEmail?.id === email.id) setSelectedScheduledEmail(null);
  }, [openComposer, accounts, refreshScheduledCounts, selectedScheduledEmail, setSelectedScheduledEmail]);

  const handleContextReschedule = useCallback((email: DbScheduledEmail) => {
    setReschedulingEmail(email);
  }, []);

  const handleRescheduleConfirm = useCallback(async (newTimestamp: number) => {
    if (!reschedulingEmail) return;
    await updateScheduledTime(reschedulingEmail.id, newTimestamp);
    setEmails((prev) => prev.map((e) => e.id === reschedulingEmail.id ? { ...e, scheduled_at: newTimestamp } : e));
    if (selectedScheduledEmail?.id === reschedulingEmail.id) {
      setSelectedScheduledEmail({ ...reschedulingEmail, scheduled_at: newTimestamp });
    }
    setReschedulingEmail(null);
    window.dispatchEvent(new Event("velo-sync-done"));
  }, [reschedulingEmail, selectedScheduledEmail, setSelectedScheduledEmail]);

  const handleContextCancel = useCallback(async (id: string) => {
    await updateScheduledEmailStatus(id, "cancelled");
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (selectedScheduledEmail?.id === id) setSelectedScheduledEmail(null);
    refreshScheduledCounts(accounts.map((a) => a.id)).catch(console.error);
  }, [accounts, refreshScheduledCounts, selectedScheduledEmail, setSelectedScheduledEmail]);

  // Keyboard shortcut events — act on the currently selected scheduled email
  useEffect(() => {
    const getSelected = () => useUIStore.getState().selectedScheduledEmail;

    const onEdit = () => {
      const email = getSelected();
      if (email) handleContextEdit(email);
    };
    const onReschedule = () => {
      const email = getSelected();
      if (email) handleContextReschedule(email);
    };
    const onCancel = () => {
      const email = getSelected();
      if (email) void handleContextCancel(email.id);
    };

    window.addEventListener("velo-scheduled-edit-selected", onEdit);
    window.addEventListener("velo-scheduled-reschedule-selected", onReschedule);
    window.addEventListener("velo-scheduled-cancel-selected", onCancel);
    return () => {
      window.removeEventListener("velo-scheduled-edit-selected", onEdit);
      window.removeEventListener("velo-scheduled-reschedule-selected", onReschedule);
      window.removeEventListener("velo-scheduled-cancel-selected", onCancel);
    };
  }, [handleContextEdit, handleContextReschedule, handleContextCancel]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        illustration={ScheduledEmptyIllustration}
        title={t("layout.emailList.emptyScheduled.title")}
        subtitle={t("layout.emailList.emptyScheduled.subtitle")}
      />
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {emails.map((email) => (
          <ScheduledItem
            key={email.id}
            email={email}
            account={accounts.find((a) => a.id === email.account_id) ?? null}
            isSelected={selectedScheduledEmail?.id === email.id}
            onClick={() => setSelectedScheduledEmail(email)}
            onCancelQuick={(e) => handleCancelQuick(e, email.id)}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {reschedulingEmail && (
        <DateTimePickerDialog
          isOpen={true}
          onClose={() => setReschedulingEmail(null)}
          title={t("layout.scheduledPanel.rescheduleTitle")}
          presets={getSchedulePresets({ tomorrowMorning: "layout.scheduledPanel.tomorrowMorning", tomorrowAfternoon: "layout.scheduledPanel.tomorrowAfternoon", mondayMorning: "layout.scheduledPanel.mondayMorning" })}
          onSelect={handleRescheduleConfirm}
          submitLabel={t("layout.scheduledPanel.rescheduleSubmit")}
          zIndex="z-[60]"
        />
      )}
    </>
  );
}
