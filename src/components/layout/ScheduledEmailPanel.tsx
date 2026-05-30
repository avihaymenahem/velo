import { useState, useMemo } from "react";
import { t } from "@/i18n";
import { X, Clock, Edit2, Trash2, RotateCcw } from "lucide-react";
import { getFileIcon, formatFileSize } from "@/utils/fileTypeHelpers";
import { Button } from "@/components/ui/Button";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import {
  updateScheduledEmailStatus,
  updateScheduledTime,
  type DbScheduledEmail,
} from "@/services/db/scheduledEmails";
import { getSchedulePresets } from "@/utils/schedulePresets";

interface ScheduledEmailPanelProps {
  email: DbScheduledEmail;
  onClose: () => void;
  onEdit: (email: DbScheduledEmail) => void;
  onCancelled: (id: string) => void;
  onRescheduled: (id: string, newTime: number) => void;
}

function formatScheduledAt(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return t("layout.scheduledPanel.todayAt", { time: timeStr });
  if (isTomorrow) return t("layout.scheduledPanel.tomorrowAt", { time: timeStr });

  return (
    date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
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

export function ScheduledEmailPanel({
  email,
  onClose,
  onEdit,
  onCancelled,
  onRescheduled,
}: ScheduledEmailPanelProps) {
  const [showRescheduler, setShowRescheduler] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await updateScheduledEmailStatus(email.id, "cancelled");
      onCancelled(email.id);
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async (newTimestamp: number) => {
    await updateScheduledTime(email.id, newTimestamp);
    setShowRescheduler(false);
    onRescheduled(email.id, newTimestamp);
  };

  const recipients = email.to_addresses
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bodyText = stripHtml(email.body_html).trim();

  const attachments = useMemo(() => {
    if (!email.attachment_paths) return [];
    try {
      return JSON.parse(email.attachment_paths) as { filename: string; mimeType: string; content: string }[];
    } catch {
      return [];
    }
  }, [email.attachment_paths]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-bg-primary shadow-2xl border-l border-border-primary">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary shrink-0">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-accent shrink-0" />
            <span className="text-sm font-semibold text-text-primary">{t("layout.scheduledPanel.title")}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scheduled time badge */}
        <div className="px-5 py-3 bg-accent/8 border-b border-border-primary shrink-0">
          <p className="text-sm text-accent font-medium">
            {formatScheduledAt(email.scheduled_at)}
          </p>
        </div>

        {/* Email metadata */}
        <div className="px-5 py-4 border-b border-border-primary space-y-2 shrink-0">
          <div className="flex gap-3 text-sm">
            <span className="w-8 shrink-0 text-text-tertiary text-right">{t("layout.scheduledPanel.labelTo")}</span>
            <span className="text-text-primary">{recipients.join(", ")}</span>
          </div>
          {email.cc_addresses && (
            <div className="flex gap-3 text-sm">
              <span className="w-8 shrink-0 text-text-tertiary text-right">{t("layout.scheduledPanel.labelCc")}</span>
              <span className="text-text-primary">{email.cc_addresses}</span>
            </div>
          )}
          {email.bcc_addresses && (
            <div className="flex gap-3 text-sm">
              <span className="w-8 shrink-0 text-text-tertiary text-right">{t("layout.scheduledPanel.labelBcc")}</span>
              <span className="text-text-primary">{email.bcc_addresses}</span>
            </div>
          )}
          <div className="flex gap-3 text-sm">
            <span className="w-8 shrink-0 text-text-tertiary text-right">{t("layout.scheduledPanel.labelSubject")}</span>
            <span className="text-text-primary font-medium">{email.subject ?? t("layout.scheduledPanel.noSubject")}</span>
          </div>
        </div>

        {/* Body preview */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
            {bodyText || <span className="text-text-tertiary italic">{t("layout.scheduledPanel.noContent")}</span>}
          </p>
          {attachments.length > 0 && (
            <div className="border-t border-border-secondary pt-3">
              <div className="text-xs text-text-tertiary mb-2">
                {attachments.length !== 1
                  ? t("email.attachmentList.countPlural", { count: attachments.length })
                  : t("email.attachmentList.count", { count: attachments.length })}
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, i) => {
                  const sizeBytes = Math.round((att.content.length * 3) / 4);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-border-primary bg-bg-secondary"
                    >
                      <span className="text-text-tertiary">{getFileIcon(att.mimeType, att.filename)}</span>
                      <span className="text-text-secondary truncate max-w-[200px]">{att.filename}</span>
                      <span className="text-text-tertiary whitespace-nowrap">{formatFileSize(sizeBytes)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border-primary flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            size="md"
            icon={<Edit2 size={14} />}
            onClick={() => onEdit(email)}
            className="flex-1"
          >
            {t("layout.scheduledPanel.edit")}
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={<RotateCcw size={14} />}
            onClick={() => setShowRescheduler(true)}
            className="flex-1"
          >
            {t("layout.scheduledPanel.editSchedule")}
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={<Trash2 size={14} />}
            onClick={handleCancel}
            disabled={cancelling}
            className="text-danger border-danger/30 hover:bg-danger/10"
          >
            {cancelling ? t("layout.scheduledPanel.cancelling") : t("layout.scheduledPanel.cancelSchedule")}
          </Button>
        </div>
      </div>

      {showRescheduler && (
        <DateTimePickerDialog
          isOpen={true}
          onClose={() => setShowRescheduler(false)}
          title={t("layout.scheduledPanel.rescheduleTitle")}
          presets={getSchedulePresets({
            tomorrowMorning: "layout.scheduledPanel.tomorrowMorning",
            tomorrowAfternoon: "layout.scheduledPanel.tomorrowAfternoon",
            mondayMorning: "layout.scheduledPanel.mondayMorning",
          })}
          onSelect={handleReschedule}
          submitLabel={t("layout.scheduledPanel.rescheduleSubmit")}
          zIndex="z-[60]"
        />
      )}
    </>
  );
}
