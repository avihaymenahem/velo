import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Paperclip, Search, LayoutGrid, List } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import {
  getAttachmentsForAccount,
  getAttachmentSenders,
  type AttachmentWithContext,
  type AttachmentSender,
} from "@/services/db/attachments";
import { getEmailProvider } from "@/services/email/providerFactory";
import { AttachmentPreview } from "@/components/email/AttachmentList";
import { AttachmentGridItem } from "./AttachmentGridItem";
import { AttachmentListItem } from "./AttachmentListItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { isImage, isPdf, isDocument, isSpreadsheet, isArchive } from "@/utils/fileTypeHelpers";
import { navigateToLabel } from "@/router/navigate";

type TypeFilter = "all" | "images" | "pdfs" | "documents" | "spreadsheets" | "archives" | "other";
type DateFilter = "all" | "today" | "week" | "month" | "year";
type SizeFilter = "all" | "small" | "medium" | "large";
type ViewMode = "grid" | "list";

function matchesType(att: AttachmentWithContext, filter: TypeFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "images": return isImage(att.mime_type);
    case "pdfs": return isPdf(att.mime_type, att.filename);
    case "documents": return isDocument(att.mime_type, att.filename);
    case "spreadsheets": return isSpreadsheet(att.mime_type, att.filename);
    case "archives": return isArchive(att.mime_type);
    case "other":
      return !isImage(att.mime_type) && !isPdf(att.mime_type, att.filename) &&
        !isDocument(att.mime_type, att.filename) && !isSpreadsheet(att.mime_type, att.filename) &&
        !isArchive(att.mime_type);
  }
}

function matchesDate(att: AttachmentWithContext, filter: DateFilter): boolean {
  if (filter === "all" || !att.date) return true;
  const now = Date.now();
  const diff = now - att.date;
  switch (filter) {
    case "today": return diff < 86_400_000;
    case "week": return diff < 7 * 86_400_000;
    case "month": return diff < 30 * 86_400_000;
    case "year": return diff < 365 * 86_400_000;
  }
}

function matchesSize(att: AttachmentWithContext, filter: SizeFilter): boolean {
  if (filter === "all") return true;
  const size = att.size ?? 0;
  switch (filter) {
    case "small": return size < 1_048_576;
    case "medium": return size >= 1_048_576 && size <= 10_485_760;
    case "large": return size > 10_485_760;
  }
}

export function AttachmentLibrary() {
  const { t } = useTranslation("attachments");
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;

  const [attachments, setAttachments] = useState<AttachmentWithContext[]>([]);
  const [senders, setSenders] = useState<AttachmentSender[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [senderFilter, setSenderFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentWithContext | null>(null);

  const typeOptions: { value: TypeFilter; label: string }[] = [
    { label: t("typeFilter.all"), value: "all" },
    { label: t("typeFilter.images"), value: "images" },
    { label: t("typeFilter.pdfs"), value: "pdfs" },
    { label: t("typeFilter.documents"), value: "documents" },
    { label: t("typeFilter.spreadsheets"), value: "spreadsheets" },
    { label: t("typeFilter.archives"), value: "archives" },
    { label: t("typeFilter.other"), value: "other" },
  ];

  const dateOptions: { value: DateFilter; label: string }[] = [
    { label: t("dateFilter.any"), value: "all" },
    { label: t("dateFilter.today"), value: "today" },
    { label: t("dateFilter.pastWeek"), value: "week" },
    { label: t("dateFilter.pastMonth"), value: "month" },
    { label: t("dateFilter.pastYear"), value: "year" },
  ];

  const sizeOptions: { value: SizeFilter; label: string }[] = [
    { label: t("sizeFilter.any"), value: "all" },
    { label: t("sizeFilter.small"), value: "small" },
    { label: t("sizeFilter.medium"), value: "medium" },
    { label: t("sizeFilter.large"), value: "large" },
  ];

  const loadData = useCallback(async (acctId: string) => {
    setLoading(true);
    try {
      const [atts, snds] = await Promise.all([
        getAttachmentsForAccount(acctId),
        getAttachmentSenders(acctId),
      ]);
      setAttachments(atts);
      setSenders(snds);
    } catch (err) {
      console.error("Failed to load attachments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on account change
  useEffect(() => {
    if (accountId) {
      loadData(accountId);
    } else {
      setAttachments([]);
      setSenders([]);
      setLoading(false);
    }
  }, [accountId, loadData]);

  // Refresh on sync
  useEffect(() => {
    const handler = () => {
      if (accountId) loadData(accountId);
    };
    window.addEventListener("velo-sync-done", handler);
    return () => window.removeEventListener("velo-sync-done", handler);
  }, [accountId, loadData]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return attachments.filter((att) => {
      if (q) {
        const matchName = att.filename?.toLowerCase().includes(q);
        const matchSubject = att.subject?.toLowerCase().includes(q);
        const matchSender = att.from_name?.toLowerCase().includes(q) || att.from_address?.toLowerCase().includes(q);
        if (!matchName && !matchSubject && !matchSender) return false;
      }
      if (!matchesType(att, typeFilter)) return false;
      if (senderFilter !== "all" && att.from_address !== senderFilter) return false;
      if (!matchesDate(att, dateFilter)) return false;
      if (!matchesSize(att, sizeFilter)) return false;
      return true;
    });
  }, [attachments, searchQuery, typeFilter, senderFilter, dateFilter, sizeFilter]);

  const handleDownload = useCallback(async (att: AttachmentWithContext) => {
    if (!att.gmail_attachment_id || !accountId) return;
    try {
      const filePath = await save({
        defaultPath: att.filename ?? "attachment",
        filters: [{ name: "All Files", extensions: ["*"] }],
      });
      if (!filePath) return;

      const provider = await getEmailProvider(accountId);
      const response = await provider.fetchAttachment(att.message_id, att.gmail_attachment_id);
      const base64 = response.data.replace(/-/g, "+").replace(/_/g, "/");
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      await writeFile(filePath, bytes);
    } catch (err) {
      console.error("Download failed:", err);
    }
  }, [accountId]);

  const handleJumpToEmail = useCallback((att: AttachmentWithContext) => {
    if (att.thread_id) {
      navigateToLabel("all", { threadId: att.thread_id });
    }
  }, []);

  // Track search input ref to avoid autofocus stealing
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Paperclip size={18} className="text-text-secondary" />
            <h1 className="text-base font-semibold text-text-primary">{t("attachments")}</h1>
            <span className="text-xs text-text-tertiary">({filtered.length})</span>
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              ref={searchRef}
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border-primary bg-bg-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent w-48"
            />
          </div>

          {/* Filters */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="text-xs rounded-md border border-border-primary bg-bg-secondary text-text-primary px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={senderFilter}
            onChange={(e) => setSenderFilter(e.target.value)}
            className="text-xs rounded-md border border-border-primary bg-bg-secondary text-text-primary px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent max-w-40"
          >
            <option value="all">{t("allSenders")}</option>
            {senders.map((s) => (
              <option key={s.from_address} value={s.from_address}>
                {s.from_name || s.from_address} ({s.count})
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="text-xs rounded-md border border-border-primary bg-bg-secondary text-text-primary px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {dateOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value as SizeFilter)}
            className="text-xs rounded-md border border-border-primary bg-bg-secondary text-text-primary px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {sizeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex border border-border-primary rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 ${viewMode === "grid" ? "bg-accent/10 text-accent" : "text-text-tertiary hover:text-text-primary"}`}
              title={t("gridView")}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 ${viewMode === "list" ? "bg-accent/10 text-accent" : "text-text-tertiary hover:text-text-primary"}`}
              title={t("listView")}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-tertiary">{t("loading")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Paperclip}
            title={attachments.length === 0 ? t("noAttachments") : t("noMatching")}
            subtitle={attachments.length === 0 ? t("noAttachmentsDescription") : t("noMatchingDescription")}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {filtered.map((att) => (
              <AttachmentGridItem
                key={att.id}
                attachment={att}
                onPreview={() => setPreviewAttachment(att)}
                onDownload={() => handleDownload(att)}
                onJumpToEmail={() => handleJumpToEmail(att)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((att) => (
              <AttachmentListItem
                key={att.id}
                attachment={att}
                onPreview={() => setPreviewAttachment(att)}
                onDownload={() => handleDownload(att)}
                onJumpToEmail={() => handleJumpToEmail(att)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewAttachment && (
        <AttachmentPreview
          attachment={previewAttachment}
          accountId={accountId!}
          messageId={previewAttachment.message_id}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
