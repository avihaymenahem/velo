import { useState, useEffect, useMemo } from "react";
import { Clock, Edit2, RotateCcw, Trash2, Download, Eye } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { getFileIcon, formatFileSize, canPreview, isImage, isPdf, isText, isOfficeDoc, isOfficeSpreadsheet } from "@/utils/fileTypeHelpers";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { useLabelStore } from "@/stores/labelStore";
import { useAccountStore } from "@/stores/accountStore";
import { updateScheduledEmailStatus, updateScheduledTime } from "@/services/db/scheduledEmails";
import { EmailRenderer } from "@/components/email/EmailRenderer";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { OfficeDocPreview } from "@/components/ui/OfficeDocPreview";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { getSchedulePresets } from "@/utils/schedulePresets";
import { t } from "@/i18n";

type ScheduledAttachment = { filename: string; mimeType: string; content: string };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function ScheduledAttachmentPreview({ att, onClose }: { att: ScheduledAttachment; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [saving, setSaving] = useState(false);

  const isPreviewable = canPreview(att.mimeType, att.filename);
  const isOffice = isOfficeDoc(att.mimeType, att.filename) || isOfficeSpreadsheet(att.mimeType, att.filename);

  useEffect(() => {
    if (!isPreviewable) return;
    const bytes = base64ToBytes(att.content);
    if (isOffice) {
      setPreviewBytes(bytes);
    } else {
      const effectiveMime = isPdf(att.mimeType, att.filename) ? "application/pdf" : (att.mimeType ?? "application/octet-stream");
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: effectiveMime });
      setBlobUrl(URL.createObjectURL(blob));
    }
    return () => { setBlobUrl((u) => { if (u) URL.revokeObjectURL(u); return null; }); };
  }, [att, isPreviewable, isOffice]);

  const handleDownload = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const filePath = await save({ defaultPath: att.filename, filters: [{ name: "All Files", extensions: ["*"] }] });
      if (!filePath) return;
      await writeFile(filePath, base64ToBytes(att.content));
    } catch (err) {
      console.error("Failed to save attachment:", err);
    } finally {
      setSaving(false);
    }
  };

  const sizeBytes = Math.round((att.content.length * 3) / 4);

  const header = (
    <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span>{getFileIcon(att.mimeType, att.filename)}</span>
        <span className="text-sm font-medium text-text-primary truncate">{att.filename}</span>
        <span className="text-xs text-text-tertiary whitespace-nowrap">({formatFileSize(sizeBytes)})</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <button
          onClick={handleDownload}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
        >
          <Download size={13} />
          {saving ? t("email.attachmentList.saving") : t("email.attachmentList.download")}
        </button>
        <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-lg leading-none">×</button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={true} onClose={onClose} title={att.filename} width="w-[800px]" panelClassName="max-w-[90vw] max-h-[85vh] flex flex-col" renderHeader={header}>
      <div className="flex-1 overflow-auto min-h-[200px] flex items-center justify-center p-4" data-native-context-menu>
        {blobUrl && isImage(att.mimeType) && (
          <img src={blobUrl} alt={att.filename} className="max-w-full max-h-[70vh] object-contain rounded" />
        )}
        {blobUrl && isPdf(att.mimeType, att.filename) && (
          <iframe src={blobUrl} title={att.filename} className="w-full h-[70vh] border-0 rounded" />
        )}
        {blobUrl && isText(att.mimeType) && <TextPreview url={blobUrl} />}
        {previewBytes && <OfficeDocPreview bytes={previewBytes} mimeType={att.mimeType} filename={att.filename} />}
        {!isPreviewable && (
          <div className="flex flex-col items-center gap-3 text-text-tertiary">
            <Eye size={40} strokeWidth={1} />
            <p className="text-sm">{t("email.attachmentList.previewNotAvailable")}</p>
            <p className="text-xs">{att.mimeType}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => { fetch(url).then((r) => r.text()).then(setText).catch(() => setText("Failed to load")); }, [url]);
  return (
    <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono w-full max-h-[70vh] overflow-auto bg-bg-tertiary rounded p-4">
      {text ?? "Loading..."}
    </pre>
  );
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
      weekday: "long",
      month: "long",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    }) +
    " at " +
    timeStr
  );
}

export function ScheduledEmailDetailView() {
  const email = useUIStore((s) => s.selectedScheduledEmail);
  const setSelectedScheduledEmail = useUIStore((s) => s.setSelectedScheduledEmail);
  const openComposer = useComposerStore((s) => s.openComposer);
  const refreshScheduledCounts = useLabelStore((s) => s.refreshScheduledCounts);
  const accounts = useAccountStore((s) => s.accounts);
  const [showRescheduler, setShowRescheduler] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<ScheduledAttachment | null>(null);

  const attachments = useMemo(() => {
    if (!email?.attachment_paths) return [];
    try {
      return JSON.parse(email.attachment_paths) as { filename: string; mimeType: string; content: string }[];
    } catch {
      return [];
    }
  }, [email?.attachment_paths]);

  if (!email) return null;

  const account = accounts.find((a) => a.id === email.account_id) ?? null;
  const recipients = email.to_addresses.split(",").map((s) => s.trim()).filter(Boolean);
  const ccList = email.cc_addresses?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const bccList = email.bcc_addresses?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const handleEdit = () => {
    const to = email.to_addresses.split(",").map((s) => s.trim()).filter(Boolean);
    const cc = email.cc_addresses ? email.cc_addresses.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const bcc = email.bcc_addresses ? email.bcc_addresses.split(",").map((s) => s.trim()).filter(Boolean) : [];
    openComposer({
      mode: "new",
      to,
      cc,
      bcc,
      subject: email.subject ?? "",
      bodyHtml: email.body_html,
      threadId: email.thread_id,
      accountId: email.account_id,
    });
    updateScheduledEmailStatus(email.id, "cancelled")
      .then(() => refreshScheduledCounts(accounts.map((a) => a.id)))
      .catch(console.error);
    window.dispatchEvent(new CustomEvent("velo-scheduled-removed", { detail: { id: email.id } }));
    setSelectedScheduledEmail(null);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await updateScheduledEmailStatus(email.id, "cancelled");
      window.dispatchEvent(new CustomEvent("velo-scheduled-removed", { detail: { id: email.id } }));
      setSelectedScheduledEmail(null);
      refreshScheduledCounts(accounts.map((a) => a.id)).catch(console.error);
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = async (newTimestamp: number) => {
    await updateScheduledTime(email.id, newTimestamp);
    setSelectedScheduledEmail({ ...email, scheduled_at: newTimestamp });
    setShowRescheduler(false);
    window.dispatchEvent(new Event("velo-sync-done"));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-3 border-b border-border-secondary bg-bg-secondary">
        <Button
          variant="secondary"
          iconOnly
          icon={<Edit2 size={15} />}
          onClick={handleEdit}
          title={t("layout.scheduledPanel.edit")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<RotateCcw size={15} />}
          onClick={() => setShowRescheduler(true)}
          title={t("layout.scheduledPanel.editSchedule")}
        />
        <div className="ml-auto" />
        <Button
          variant="secondary"
          iconOnly
          icon={<Trash2 size={15} />}
          onClick={handleCancel}
          disabled={cancelling}
          title={t("layout.scheduledPanel.cancelSchedule")}
          className="hover:text-danger hover:bg-danger/10"
        />
      </div>

      {/* Subject */}
      <div data-tauri-drag-region className="px-6 py-4 border-b border-border-primary shrink-0">
        <h1 className="text-lg font-semibold text-text-primary">
          {email.subject ?? t("layout.scheduledPanel.noSubject")}
        </h1>
      </div>

      {/* Message header — mirrors MessageItem expanded header */}
      <div className="relative group px-4 py-3 border-b border-border-secondary shrink-0 hover:bg-bg-hover transition-colors">
        {/* Row 1: badge + sender name | clock + scheduled date */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium bg-accent/20 text-accent">
              {(account?.email?.[0] ?? "?").toUpperCase()}
            </div>
            <span className="text-sm font-medium text-text-primary truncate">
              {account?.email ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 group-hover:invisible">
            <Clock size={12} className="text-accent" />
            <span className="text-xs font-medium text-accent whitespace-nowrap">
              {formatScheduledAt(email.scheduled_at)}
            </span>
          </div>
        </div>
        {/* Row 2-N: recipients aligned with badge left edge */}
        <div className="mt-1 text-xs text-text-tertiary space-y-0.5">
          {recipients.length > 0 && (
            <div>
              <span className="text-text-secondary">{t("layout.scheduledPanel.labelTo")}</span>{" "}
              {recipients.join(", ")}
            </div>
          )}
          {ccList.length > 0 && (
            <div>
              <span className="text-text-secondary">{t("layout.scheduledPanel.labelCc")}</span>{" "}
              {ccList.join(", ")}
            </div>
          )}
          {bccList.length > 0 && (
            <div>
              <span className="text-text-secondary">{t("layout.scheduledPanel.labelBcc")}</span>{" "}
              {bccList.join(", ")}
            </div>
          )}
        </div>
        {/* Hover actions — overlaid over date, same pattern as MessageItem */}
        <div className="hidden group-hover:flex absolute top-3 right-4 items-center gap-0.5 bg-bg-primary/90 rounded-md shadow-sm border border-border-secondary px-0.5 py-0.5 z-10">
          <button
            onClick={handleEdit}
            className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title={t("layout.scheduledPanel.edit")}
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={() => setShowRescheduler(true)}
            className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title={t("layout.scheduledPanel.editSchedule")}
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors disabled:opacity-50"
            title={t("layout.scheduledPanel.cancelSchedule")}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Body — same EmailRenderer used in MessageItem */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-4">
          <EmailRenderer
            key={email.id}
            html={email.body_html}
            text={null}
            blockImages={false}
            accountId={email.account_id}
            senderAddress={account?.email ?? null}
          />
          {attachments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-secondary">
              <div className="text-xs text-text-tertiary mb-2">
                {attachments.length !== 1
                  ? t("email.attachmentList.countPlural", { count: attachments.length })
                  : t("email.attachmentList.count", { count: attachments.length })}
              </div>
              <div className="flex flex-wrap gap-2">
                {attachments.map((att, i) => {
                  const sizeBytes = Math.round((att.content.length * 3) / 4);
                  return (
                    <button
                      key={i}
                      onClick={() => setPreviewAtt(att)}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-border-primary hover:bg-bg-hover transition-colors"
                    >
                      <span className="text-text-tertiary">{getFileIcon(att.mimeType, att.filename)}</span>
                      <span className="text-text-secondary truncate max-w-[200px]">{att.filename}</span>
                      <span className="text-text-tertiary whitespace-nowrap">{formatFileSize(sizeBytes)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {previewAtt && <ScheduledAttachmentPreview att={previewAtt} onClose={() => setPreviewAtt(null)} />}
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
    </div>
  );
}
