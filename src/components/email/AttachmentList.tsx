import { useState, useCallback, useRef, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { getAttachmentsForMessage, type DbAttachment } from "@/services/db/attachments";
import { getEmailProvider } from "@/services/email/providerFactory";
import { Modal } from "@/components/ui/Modal";
import { Download, Eye } from "lucide-react";
import { formatFileSize, isImage, isPdf, isText, canPreview, getFileIcon } from "@/utils/fileTypeHelpers";

/** Dedup attachments by filename+size (content-based) */
function dedup(attachments: DbAttachment[]): DbAttachment[] {
  const seen = new Set<string>();
  return attachments.filter((a) => {
    const key = `${a.filename}:${a.size}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface AttachmentListProps {
  accountId: string;
  messageId: string;
  attachments: DbAttachment[];
  referencedCids?: Set<string>;
}

export function AttachmentList({ accountId, messageId, attachments, referencedCids }: AttachmentListProps) {
  const [preview, setPreview] = useState<DbAttachment | null>(null);

  // Filter out CID images rendered in the email body and true inline parts, then dedup
  const fileAttachments = dedup(attachments.filter((a) => {
    // Skip attachments whose CID is referenced in the email body (already rendered inline)
    if (a.content_id && referencedCids?.has(a.content_id)) return false;
    // True inline: marked inline with no filename
    if (a.is_inline && !a.filename) return false;
    return true;
  }));

  if (fileAttachments.length === 0) return null;

  return (
    <>
      <div className="mt-3 pt-3 border-t border-border-secondary">
        <div className="text-xs text-text-tertiary mb-2">
          {fileAttachments.length} attachment{fileAttachments.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          {fileAttachments.map((att) => (
            <button
              key={att.id}
              onClick={() => setPreview(att)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border border-border-primary hover:bg-bg-hover transition-colors"
            >
              <span className="text-text-tertiary">{getFileIcon(att.mime_type)}</span>
              <span className="text-text-secondary truncate max-w-[200px]">
                {att.filename ?? "Unnamed"}
              </span>
              {att.size != null && (
                <span className="text-text-tertiary whitespace-nowrap">
                  {formatFileSize(att.size)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <AttachmentPreview
          attachment={preview}
          accountId={accountId}
          messageId={messageId}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export function AttachmentPreview({
  attachment,
  accountId,
  messageId,
  onClose,
}: {
  attachment: DbAttachment;
  accountId: string;
  messageId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);

  const isPreviewable = canPreview(attachment.mime_type, attachment.filename);

  const fetchData = useCallback(async (): Promise<Uint8Array> => {
    if (bytesRef.current) return bytesRef.current;

    const provider = await getEmailProvider(accountId);
    const response = await provider.fetchAttachment(messageId, attachment.gmail_attachment_id!);

    // Normalize URL-safe base64 (Gmail API) to standard base64
    const base64 = response.data.replace(/-/g, "+").replace(/_/g, "/");
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    bytesRef.current = bytes;
    return bytes;
  }, [accountId, messageId, attachment.gmail_attachment_id]);

  const handlePreviewLoad = useCallback(async () => {
    if (!attachment.gmail_attachment_id || !isPreviewable || blobUrl) return;

    setLoading(true);
    try {
      const bytes = await fetchData();
      const effectiveMime = isPdf(attachment.mime_type, attachment.filename)
        ? "application/pdf"
        : (attachment.mime_type ?? "application/octet-stream");
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: effectiveMime });
      setBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Failed to load preview:", err);
      setError("Failed to load preview");
    } finally {
      setLoading(false);
    }
  }, [attachment, isPreviewable, blobUrl, fetchData]);

  // Trigger preview load for previewable types
  useEffect(() => {
    if (isPreviewable && !blobUrl && !loading && !error) {
      handlePreviewLoad();
    }
  }, [isPreviewable, blobUrl, loading, error, handlePreviewLoad]);

  const handleDownload = async () => {
    if (!attachment.gmail_attachment_id || saving) return;

    setSaving(true);
    try {
      const filePath = await save({
        defaultPath: attachment.filename ?? "attachment",
        filters: [{ name: "All Files", extensions: ["*"] }],
      });

      if (!filePath) {
        setSaving(false);
        return;
      }

      const bytes = await fetchData();
      await writeFile(filePath, bytes);
    } catch (err) {
      console.error("Failed to save attachment:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    onClose();
  };

  const header = (
    <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span>{getFileIcon(attachment.mime_type)}</span>
        <span className="text-sm font-medium text-text-primary truncate">
          {attachment.filename ?? "Unnamed"}
        </span>
        {attachment.size != null && (
          <span className="text-xs text-text-tertiary whitespace-nowrap">
            ({formatFileSize(attachment.size)})
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <button
          onClick={handleDownload}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
        >
          <Download size={13} />
          {saving ? "Saving..." : "Download"}
        </button>
        <button
          onClick={handleClose}
          className="text-text-tertiary hover:text-text-primary text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title={attachment.filename ?? "Attachment"}
      width="w-[800px]"
      panelClassName="max-w-[90vw] max-h-[85vh] flex flex-col"
      renderHeader={header}
    >
      {/* Allow native right-click in preview (save image, copy, etc.) */}
      <div className="flex-1 overflow-auto min-h-[200px] flex items-center justify-center p-4" data-native-context-menu>
        {loading && (
          <p className="text-sm text-text-tertiary">Loading preview...</p>
        )}
        {error && (
          <p className="text-sm text-text-tertiary">{error}</p>
        )}
        {!loading && !error && blobUrl && isImage(attachment.mime_type) && (
          <img
            src={blobUrl}
            alt={attachment.filename ?? "Attachment"}
            className="max-w-full max-h-[70vh] object-contain rounded"
          />
        )}
        {!loading && !error && blobUrl && isPdf(attachment.mime_type, attachment.filename) && (
          <iframe
            src={blobUrl}
            title={attachment.filename ?? "PDF preview"}
            className="w-full h-[70vh] border-0 rounded"
          />
        )}
        {!loading && !error && blobUrl && isText(attachment.mime_type) && (
          <TextPreview url={blobUrl} />
        )}
        {!isPreviewable && !loading && (
          <div className="flex flex-col items-center gap-3 text-text-tertiary">
            <Eye size={40} strokeWidth={1} />
            <p className="text-sm">Preview not available for this file type</p>
            <p className="text-xs">{attachment.mime_type ?? "Unknown type"}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then(setText).catch(() => setText("Failed to load text"));
  }, [url]);

  return (
    <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono w-full max-h-[70vh] overflow-auto bg-bg-tertiary rounded p-4">
      {text ?? "Loading..."}
    </pre>
  );
}

export { getAttachmentsForMessage };
