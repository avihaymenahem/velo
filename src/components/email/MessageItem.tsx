import { useState, useRef, useEffect } from "react";
import { formatFullDate } from "@/utils/date";
import { EmailRenderer } from "./EmailRenderer";
import { InlineAttachmentPreview } from "./InlineAttachmentPreview";
import { AttachmentList, getAttachmentsForMessage } from "./AttachmentList";
import type { DbMessage } from "@/services/db/messages";
import type { DbAttachment } from "@/services/db/attachments";
import { MailMinus } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MessageItemProps {
  message: DbMessage;
  isLast: boolean;
  blockImages?: boolean | null;
  senderAllowlisted?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function MessageItem({ message, isLast, blockImages, senderAllowlisted, onContextMenu }: MessageItemProps) {
  const [expanded, setExpanded] = useState(isLast);
  const [attachments, setAttachments] = useState<DbAttachment[]>([]);
  const [, setPreviewAttachment] = useState<DbAttachment | null>(null);
  const attachmentsLoadedRef = useRef(false);

  const loadAttachments = async () => {
    if (attachmentsLoadedRef.current) return;
    attachmentsLoadedRef.current = true;
    try {
      const atts = await getAttachmentsForMessage(message.account_id, message.id);
      setAttachments(atts);
    } catch {
      // Non-critical — just show no attachments
    }
  };

  // Load attachments for initially-expanded (last) message on mount
  useEffect(() => {
    if (isLast) {
      loadAttachments();
    }
  }, [isLast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      loadAttachments();
    }
  };

  const fromDisplay = message.from_name ?? message.from_address ?? "Unknown";

  return (
    <div className="border-b border-border-secondary last:border-b-0" onContextMenu={onContextMenu}>
      {/* Header — always visible, click to expand/collapse */}
      <button
        onClick={handleToggle}
        className="w-full text-left px-4 py-3 hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center shrink-0 text-xs font-medium">
              {fromDisplay[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="text-sm font-medium text-text-primary truncate block">
                {fromDisplay}
              </span>
              {!expanded && (
                <span className="text-xs text-text-tertiary truncate block">
                  {message.snippet}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-text-tertiary whitespace-nowrap shrink-0 ml-2">
            {formatFullDate(message.date)}
          </span>
        </div>
        {expanded && (
          <div className="mt-1 text-xs text-text-tertiary">
            {message.to_addresses && (
              <span>To: {message.to_addresses}</span>
            )}
          </div>
        )}
      </button>

      {/* Body — shown when expanded and image setting resolved */}
      {expanded && (
        <div className="px-4 pb-4">
          {message.list_unsubscribe && (
            <UnsubscribeLink header={message.list_unsubscribe} />
          )}

          {blockImages != null ? (
            <EmailRenderer
              html={message.body_html}
              text={message.body_text}
              blockImages={blockImages}
              senderAddress={message.from_address}
              accountId={message.account_id}
              senderAllowlisted={senderAllowlisted}
            />
          ) : (
            <div className="py-8 text-center text-text-tertiary text-sm">Loading...</div>
          )}

          <InlineAttachmentPreview
            accountId={message.account_id}
            messageId={message.id}
            attachments={attachments}
            onAttachmentClick={setPreviewAttachment}
          />

          <AttachmentList
            accountId={message.account_id}
            messageId={message.id}
            attachments={attachments}
          />
        </div>
      )}
    </div>
  );
}

export function parseUnsubscribeUrl(header: string): string | null {
  // Prefer https URL over mailto
  const httpMatch = header.match(/<(https?:\/\/[^>]+)>/);
  if (httpMatch?.[1]) return httpMatch[1];
  const mailtoMatch = header.match(/<(mailto:[^>]+)>/);
  if (mailtoMatch?.[1]) return mailtoMatch[1];
  return null;
}

function UnsubscribeLink({ header }: { header: string }) {
  const url = parseUnsubscribeUrl(header);
  if (!url) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await openUrl(url);
    } catch (err) {
      console.error("Failed to open unsubscribe link:", err);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary mb-2 transition-colors"
    >
      <MailMinus size={12} />
      Unsubscribe
    </button>
  );
}

