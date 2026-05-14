import { memo, useState, useRef, useEffect, useMemo, forwardRef } from "react";
import { formatFullDate } from "@/utils/date";
import { EmailRenderer } from "./EmailRenderer";
import { InlineAttachmentPreview } from "./InlineAttachmentPreview";
import { AttachmentList, getAttachmentsForMessage } from "./AttachmentList";
import type { DbMessage } from "@/services/db/messages";
import type { DbAttachment } from "@/services/db/attachments";
import { MailMinus } from "lucide-react";
import { AuthBadge } from "./AuthBadge";
import { AuthWarningBanner } from "./AuthWarningBanner";

interface MessageItemProps {
  message: DbMessage;
  isLast: boolean;
  blockImages?: boolean | null;
  senderAllowlisted?: boolean;
  accountId?: string;
  threadId?: string;
  isSpam?: boolean;
  focused?: boolean;
  onSelect?: (messageId: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const MessageItem = memo(forwardRef<HTMLDivElement, MessageItemProps>(function MessageItem({ message, isLast, blockImages, senderAllowlisted, accountId, threadId, isSpam, focused, onSelect, onContextMenu }, ref) {
  const [expanded, setExpanded] = useState(isLast);
  const [attachments, setAttachments] = useState<DbAttachment[]>([]);
  const [authBannerDismissed, setAuthBannerDismissed] = useState(false);
  const [cidMap, setCidMap] = useState<Map<string, string>>(new Map());
  const [cidFailed, setCidFailed] = useState<Set<string>>(new Set());
  const attachmentsLoadedRef = useRef(false);

  const resolveCidImages = async (atts: DbAttachment[]) => {
    const html = message.body_html;
    if (!html || !/\bcid:/i.test(html)) return;

    const cidAtts = atts.filter((a) => a.content_id && (a.gmail_attachment_id || a.imap_part_id));
    if (cidAtts.length === 0) return;

    try {
      const { getEmailProvider } = await import("@/services/email/providerFactory");
      const provider = await getEmailProvider(message.account_id);

      const newMap = new Map<string, string>();
      const failed: string[] = [];

      for (const att of cidAtts) {
        if (!att.content_id || (!att.gmail_attachment_id && !att.imap_part_id)) continue;
        if (!new RegExp(`cid:${escapeCid(att.content_id)}`, "i").test(html)) continue;

        const attachmentId = att.gmail_attachment_id ?? att.imap_part_id!;

        // Try once immediately, then wait for the sync cycle to release the IMAP
        // connection before retrying — the sync holds the only session on servers
        // that limit concurrent logins, so retrying on a fixed timer can mean waiting
        // through the full fetch timeout (up to minutes) rather than seconds.
        let data: string | null = null;
        console.log(`[CID-DBG] fetching cid="${att.content_id}" attachmentId="${attachmentId}" msgId="${message.id}"`);
        try {
          ({ data } = await provider.fetchAttachment(message.id, attachmentId));
          console.log(`[CID-DBG] fetch OK, data.length=${data.length}`);
        } catch (err) {
          console.warn(`[CID-DBG] fetch attempt 1 failed:`, err, `— waiting for velo-sync-done`);
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            document.addEventListener("velo-sync-done", done, { once: true });
            setTimeout(done, 30_000);
          });
          console.log(`[CID-DBG] retrying after sync-done`);
          try {
            ({ data } = await provider.fetchAttachment(message.id, attachmentId));
            console.log(`[CID-DBG] retry OK, data.length=${data.length}`);
          } catch (err2) {
            console.error(`[CID-DBG] retry also failed:`, err2);
          }
        }

        if (!data) {
          console.warn(`[CID-DBG] no data for cid="${att.content_id}" → marking failed`);
          failed.push(att.content_id.replace(/[<>]/g, "").trim());
          continue;
        }

        const base64 = data.includes("-") || data.includes("_")
          ? data.replace(/-/g, "+").replace(/_/g, "/")
          : data;
        // Use data: URI — WKWebView sandboxed iframes cannot load blob URLs from the
        // parent window's registry, but data: URIs set via DOM are fine.
        const dataUri = `data:${att.mime_type ?? "application/octet-stream"};base64,${base64}`;
        // Strip angle brackets — MIME Content-ID headers use <uuid> but the HTML
        // cid: URI and our data-cid attribute never include them.
        const cidKey = att.content_id.replace(/[<>]/g, "").trim();
        newMap.set(cidKey, dataUri);
      }

      console.log(`[CID-DBG] done — resolved=${newMap.size} failed=${failed.length}`, [...newMap.keys()]);
      if (newMap.size > 0) setCidMap(newMap);
      if (failed.length > 0) setCidFailed(new Set(failed));
    } catch {
      // Silently fall back to original HTML
    }
  };

  const loadAttachments = async () => {
    if (attachmentsLoadedRef.current) return;
    attachmentsLoadedRef.current = true;
    try {
      const atts = await getAttachmentsForMessage(message.account_id, message.id);
      setAttachments(atts);
      resolveCidImages(atts);
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

  // Auto-expand when focused via keyboard navigation
  useEffect(() => {
    if (focused) {
      onSelect?.(message.id);
      if (!expanded) {
        setExpanded(true);
        loadAttachments();
      }
    }
  }, [focused, message.id, onSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      loadAttachments();
      onSelect?.(message.id);
    }
  };

  // Scan HTML body for cid: references — these images are already rendered inline
  const referencedCids = useMemo(() => {
    const cids = new Set<string>();
    if (!message.body_html) return cids;
    const regex = /\bcid:([^"'\s)]+)/gi;
    let m;
    while ((m = regex.exec(message.body_html)) !== null) {
      cids.add(m[1]!);
    }
    return cids;
  }, [message.body_html]);

  const fromDisplay = message.from_name ?? message.from_address ?? "Unknown";

  return (
    <div ref={ref} className={`border-b border-border-secondary last:border-b-0 ${isSpam ? "bg-red-500/8 dark:bg-red-500/10" : ""} ${focused ? "ring-2 ring-inset ring-accent/50" : ""}`} onContextMenu={onContextMenu}>
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
              <span className="text-sm font-medium text-text-primary truncate flex items-center gap-1">
                {fromDisplay}
                <AuthBadge authResults={message.auth_results} />
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
          {!authBannerDismissed && (
            <AuthWarningBanner
              authResults={message.auth_results}
              senderAddress={message.from_address}
              onDismiss={() => setAuthBannerDismissed(true)}
            />
          )}

          {message.list_unsubscribe && (
            <UnsubscribeLink
              header={message.list_unsubscribe}
              postHeader={message.list_unsubscribe_post}
              accountId={accountId ?? message.account_id}
              threadId={threadId ?? message.thread_id}
              fromAddress={message.from_address}
              fromName={message.from_name}
            />
          )}

          {blockImages != null ? (
            <EmailRenderer
              html={message.body_html}
              text={message.body_text}
              blockImages={blockImages}
              senderAddress={message.from_address}
              accountId={message.account_id}
              senderAllowlisted={senderAllowlisted}
              cidMap={cidMap}
              cidFailed={cidFailed}
            />
          ) : (
            <div className="py-8 text-center text-text-tertiary text-sm">Loading...</div>
          )}

          <InlineAttachmentPreview
            accountId={message.account_id}
            messageId={message.id}
            attachments={attachments}
            referencedCids={referencedCids}
            onAttachmentClick={() => {}}
          />

          <AttachmentList
            accountId={message.account_id}
            messageId={message.id}
            attachments={attachments}
            referencedCids={referencedCids}
          />
        </div>
      )}
    </div>
  );
}));

function escapeCid(cid: string): string {
  return cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseUnsubscribeUrl(header: string): string | null {
  // Prefer https URL over mailto
  const httpMatch = header.match(/<(https?:\/\/[^>]+)>/);
  if (httpMatch?.[1]) return httpMatch[1];
  const mailtoMatch = header.match(/<(mailto:[^>]+)>/);
  if (mailtoMatch?.[1]) return mailtoMatch[1];
  return null;
}

function UnsubscribeLink({
  header,
  postHeader,
  accountId,
  threadId,
  fromAddress,
  fromName,
}: {
  header: string;
  postHeader?: string | null;
  accountId: string;
  threadId: string;
  fromAddress: string | null;
  fromName: string | null;
}) {
  const url = parseUnsubscribeUrl(header);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "failed">("idle");
  if (!url) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus("loading");
    try {
      const { executeUnsubscribe } = await import("@/services/unsubscribe/unsubscribeManager");
      const result = await executeUnsubscribe(
        accountId,
        threadId,
        fromAddress ?? "unknown",
        fromName,
        header,
        postHeader ?? null,
      );
      setStatus(result.success ? "done" : "failed");
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
      setStatus("failed");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={status === "loading" || status === "done"}
      className={`flex items-center gap-1 text-xs mb-2 transition-colors ${
        status === "done"
          ? "text-success"
          : status === "failed"
            ? "text-danger"
            : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      <MailMinus size={12} />
      {status === "loading" && "Unsubscribing..."}
      {status === "done" && "Unsubscribed"}
      {status === "failed" && "Unsubscribe failed — click to retry"}
      {status === "idle" && "Unsubscribe"}
    </button>
  );
}

