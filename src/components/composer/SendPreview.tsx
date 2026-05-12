import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
import { sanitizeHtml } from "@/utils/sanitize";
import { Paperclip, Eye, EyeOff } from "lucide-react";

interface SendPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SendPreview({ isOpen, onClose, onSend }: SendPreviewProps) {
  const to = useComposerStore((s) => s.to);
  const cc = useComposerStore((s) => s.cc);
  const bcc = useComposerStore((s) => s.bcc);
  const subject = useComposerStore((s) => s.subject);
  const fromEmail = useComposerStore((s) => s.fromEmail);
  const attachments = useComposerStore((s) => s.attachments);
  const bodyHtml = useComposerStore((s) => s.bodyHtml);
  const signatureHtml = useComposerStore((s) => s.signatureHtml);
  const activeAccount = useAccountStore((s) =>
    s.accounts.find((a) => a.id === s.activeAccountId),
  );
  const [showPreview, setShowPreview] = useState(true);

  const fullHtml = useMemo(() => {
    if (!signatureHtml) return sanitizeHtml(bodyHtml);
    return `${bodyHtml}<div style="margin-top:16px;border-top:1px solid #e5e5e5;padding-top:12px">${sanitizeHtml(signatureHtml)}</div>`;
  }, [bodyHtml, signatureHtml]);

  const senderEmail = fromEmail ?? activeAccount?.email ?? "";
  const totalSize = attachments.reduce((sum, a) => sum + a.size, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send Preview"
      width="w-[640px] max-w-[90vw]"
      panelClassName="max-h-[85vh] flex flex-col"
    >
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Envelope info */}
        <div className="px-4 py-3 space-y-1.5 border-b border-border-secondary bg-bg-secondary text-xs text-text-secondary font-mono">
          <div className="flex gap-2">
            <span className="text-text-tertiary w-16 shrink-0">From:</span>
            <span className="text-text-primary truncate">{senderEmail}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-text-tertiary w-16 shrink-0">To:</span>
            <span className="text-text-primary truncate">{to.join(", ") || "(none)"}</span>
          </div>
          {cc.length > 0 && (
            <div className="flex gap-2">
              <span className="text-text-tertiary w-16 shrink-0">Cc:</span>
              <span className="text-text-primary truncate">{cc.join(", ")}</span>
            </div>
          )}
          {bcc.length > 0 && (
            <div className="flex gap-2">
              <span className="text-text-tertiary w-16 shrink-0">Bcc:</span>
              <span className="text-text-primary truncate">{bcc.join(", ")}</span>
            </div>
          )}
          {subject && (
            <div className="flex gap-2">
              <span className="text-text-tertiary w-16 shrink-0">Subject:</span>
              <span className="text-text-primary truncate">{subject}</span>
            </div>
          )}

          {/* Reply-To hints */}
          {senderEmail && (
            <div className="flex gap-2">
              <span className="text-text-tertiary w-16 shrink-0">Reply-To:</span>
              <span className="text-text-primary truncate">{senderEmail}</span>
            </div>
          )}
        </div>

        {/* Toggle preview */}
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-border-secondary">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showPreview ? "Hide preview" : "Show preview"}
          </button>

          {/* Attachments summary */}
          {attachments.length > 0 && (
            <span className="text-xs text-text-tertiary flex items-center gap-1">
              <Paperclip size={12} />
              {attachments.length} file{attachments.length > 1 ? "s" : ""}
              {totalSize > 0 && ` (${formatFileSize(totalSize)})`}
            </span>
          )}
        </div>

        {/* HTML preview */}
        {showPreview && (
          <div className="flex-1 overflow-y-auto bg-white">
            <iframe
              title="Email Preview"
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a}img{max-width:100%}</style></head><body>${fullHtml}</body></html>`}
              className="w-full h-full border-0"
              sandbox="allow-same-origin"
            />
          </div>
        )}

        {/* Attachment list */}
        {attachments.length > 0 && (
          <div className="border-t border-border-secondary px-4 py-2 space-y-1 max-h-32 overflow-y-auto">
            <span className="text-xs font-medium text-text-tertiary">Attachments</span>
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between text-xs text-text-secondary"
              >
                <span className="truncate flex-1">{att.filename}</span>
                <span className="text-text-tertiary ml-2 shrink-0">{formatFileSize(att.size)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-primary bg-bg-secondary">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-border-primary text-text-secondary hover:bg-bg-hover transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => { onSend(); onClose(); }}
            className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </Modal>
  );
}
