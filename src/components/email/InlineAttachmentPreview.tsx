import { useState, useEffect, useRef, useCallback } from "react";
import type { DbAttachment } from "@/services/db/attachments";
import { getEmailProvider } from "@/services/email/providerFactory";
import { FileText } from "lucide-react";
import { formatFileSize, isImage, isPdf } from "@/utils/fileTypeHelpers";

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

interface InlineAttachmentPreviewProps {
  accountId: string;
  messageId: string;
  attachments: DbAttachment[];
  referencedCids?: Set<string>;
  onAttachmentClick: (attachment: DbAttachment) => void;
}

export function InlineAttachmentPreview({
  accountId,
  messageId,
  attachments,
  referencedCids,
  onAttachmentClick,
}: InlineAttachmentPreviewProps) {
  // Filter to previewable non-inline attachments, dedup, exclude CID-referenced
  const previewableAttachments = dedup(attachments.filter((a) => {
    // Skip attachments whose CID is referenced in the email body
    if (a.content_id && referencedCids?.has(a.content_id)) return false;
    if (a.is_inline && !a.filename) return false;
    return isImage(a.mime_type) || isPdf(a.mime_type, a.filename);
  }));

  if (previewableAttachments.length === 0) return null;

  const images = previewableAttachments.filter((a) => isImage(a.mime_type));
  const pdfs = previewableAttachments.filter((a) => isPdf(a.mime_type, a.filename));

  return (
    <div className="mt-3">
      {/* Image thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((att) => (
            <ImageThumbnail
              key={att.id}
              attachment={att}
              accountId={accountId}
              messageId={messageId}
              onClick={() => onAttachmentClick(att)}
            />
          ))}
        </div>
      )}

      {/* PDF cards */}
      {pdfs.length > 0 && (
        <div className="space-y-1">
          {pdfs.map((att) => (
            <button
              key={att.id}
              onClick={() => onAttachmentClick(att)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-bg-tertiary/50 hover:bg-bg-hover transition-colors w-full text-left"
            >
              <FileText size={16} className="text-danger shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-text-primary truncate">
                  {att.filename ?? "Document.pdf"}
                </div>
                {att.size != null && (
                  <div className="text-[0.625rem] text-text-tertiary">
                    {formatFileSize(att.size)}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageThumbnail({
  attachment,
  accountId,
  messageId,
  onClick,
}: {
  attachment: DbAttachment;
  accountId: string;
  messageId: string;
  onClick: () => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(false);

  const loadThumbnail = useCallback(async () => {
    if (loadedRef.current || !attachment.gmail_attachment_id) return;
    loadedRef.current = true;
    setLoading(true);

    try {
      const provider = await getEmailProvider(accountId);
      const response = await provider.fetchAttachment(messageId, attachment.gmail_attachment_id);

      // Normalize URL-safe base64 (Gmail API) to standard base64
      const base64 = response.data.replace(/-/g, "+").replace(/_/g, "/");
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer as ArrayBuffer], {
        type: attachment.mime_type ?? "image/jpeg",
      });
      setThumbnailUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Failed to load thumbnail:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId, messageId, attachment]);

  // Lazy load via IntersectionObserver
  useEffect(() => {
    const el = observerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadThumbnail();
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadThumbnail]);

  // Cleanup blob URL
  useEffect(() => {
    return () => {
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [thumbnailUrl]);

  return (
    <div ref={observerRef}>
      <button
        onClick={onClick}
        className="block rounded-md overflow-hidden border border-border-secondary hover:border-accent transition-colors"
        title={attachment.filename ?? "Image"}
      >
        {loading && (
          <div className="w-[200px] h-[120px] bg-bg-tertiary animate-pulse flex items-center justify-center">
            <span className="text-xs text-text-tertiary">Loading...</span>
          </div>
        )}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={attachment.filename ?? "Image"}
            className="max-w-[200px] max-h-[200px] object-cover"
          />
        )}
        {!loading && !thumbnailUrl && (
          <div className="w-[200px] h-[120px] bg-bg-tertiary flex items-center justify-center">
            <span className="text-xs text-text-tertiary">Image</span>
          </div>
        )}
      </button>
    </div>
  );
}

