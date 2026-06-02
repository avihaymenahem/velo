import { useTranslation } from "react-i18next";
import { Download, Eye, ExternalLink } from "lucide-react";
import { formatFileSize, getFileIcon, canPreview } from "@/utils/fileTypeHelpers";
import type { AttachmentWithContext } from "@/services/db/attachments";

interface AttachmentGridItemProps {
  attachment: AttachmentWithContext;
  onPreview: () => void;
  onDownload: () => void;
  onJumpToEmail: () => void;
}

function formatRelativeDate(timestamp: number | null, locale?: string): string {
  if (!timestamp) return "";
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
    style: "narrow",
  });
  const diff = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return formatter.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return formatter.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  if (days < 30) return formatter.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return formatter.format(-months, "month");
  return formatter.format(-Math.floor(months / 12), "year");
}

export function AttachmentGridItem({ attachment, onPreview, onDownload, onJumpToEmail }: AttachmentGridItemProps) {
  const { t, i18n } = useTranslation("attachments");
  const dateLocale = i18n.resolvedLanguage ?? i18n.language;
  const previewable = canPreview(attachment.mime_type, attachment.filename);
  const senderName = attachment.from_name || attachment.from_address || t("actions.unknown");

  return (
    <div className="group relative flex flex-col border border-border-primary rounded-lg hover:border-border-secondary hover:bg-bg-hover transition-colors overflow-hidden">
      {/* Icon area */}
      <button
        onClick={previewable ? onPreview : onDownload}
        className="flex items-center justify-center h-24 bg-bg-secondary text-3xl"
      >
        {getFileIcon(attachment.mime_type)}
      </button>

      {/* Info */}
      <div className="px-3 py-2 flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-text-primary truncate" title={attachment.filename ?? undefined}>
          {attachment.filename ?? t("actions.unnamed")}
        </span>
        <span className="text-[0.6875rem] text-text-tertiary truncate" title={senderName}>
          {senderName}
        </span>
        <div className="flex items-center gap-2 text-[0.6875rem] text-text-tertiary">
          {attachment.size != null && <span>{formatFileSize(attachment.size)}</span>}
          {attachment.date && <span>{formatRelativeDate(attachment.date, dateLocale)}</span>}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {previewable && (
          <button
            onClick={onPreview}
            className="p-1.5 rounded-md bg-bg-primary/90 border border-border-primary text-text-secondary hover:text-text-primary transition-colors"
            title={t("actions.preview")}
          >
            <Eye size={13} />
          </button>
        )}
        <button
          onClick={onDownload}
          className="p-1.5 rounded-md bg-bg-primary/90 border border-border-primary text-text-secondary hover:text-text-primary transition-colors"
          title={t("actions.download")}
        >
          <Download size={13} />
        </button>
        <button
          onClick={onJumpToEmail}
          className="p-1.5 rounded-md bg-bg-primary/90 border border-border-primary text-text-secondary hover:text-text-primary transition-colors"
          title={t("actions.jumpToEmail")}
        >
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}
