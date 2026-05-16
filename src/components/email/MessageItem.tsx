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

// ---------------------------------------------------------------------------
// Module-level semaphore — caps concurrent Gmail CID fetches.
// IMAP CIDs use the single-command batch resolver and don't need this.
// ---------------------------------------------------------------------------
let _imapFetchActive = 0;
const _imapFetchWaiters: Array<() => void> = [];
const IMAP_FETCH_LIMIT = 6;
function _acquireImapSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      if (_imapFetchActive < IMAP_FETCH_LIMIT) {
        _imapFetchActive++;
        resolve();
      } else {
        _imapFetchWaiters.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}
function _releaseImapSlot() {
  _imapFetchActive--;
  _imapFetchWaiters.shift()?.();
}

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
  onNeedBody?: () => Promise<void>;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const MessageItem = memo(forwardRef<HTMLDivElement, MessageItemProps>(function MessageItem({ message, isLast, blockImages, senderAllowlisted, accountId, threadId, isSpam, focused, onSelect, onNeedBody, onContextMenu }, ref) {
  const [expanded, setExpanded] = useState(isLast);
  const [attachments, setAttachments] = useState<DbAttachment[]>([]);
  const [authBannerDismissed, setAuthBannerDismissed] = useState(false);
  const [cidMap, setCidMap] = useState<Map<string, string>>(new Map());
  const [cidFailed, setCidFailed] = useState<Set<string>>(new Set());
  const attachmentsLoadedRef = useRef(false);

  const resolveCidImages = async (atts: DbAttachment[]) => {
    const html = message.body_html;
    if (!html || !/\bcid:/i.test(html)) return;

    console.log(
      `[CID] start msg=${message.id} body=${(html.length / 1024).toFixed(0)}KB atts=${atts.length}`,
    );
    console.time(`[CID] ${message.id}`);

    const cidAtts = atts.filter(
      (a) => a.content_id && (a.gmail_attachment_id || a.imap_part_id) &&
        new RegExp(`cid:${escapeCid(a.content_id)}`, "i").test(html),
    );
    if (cidAtts.length === 0) {
      console.timeEnd(`[CID] ${message.id}`);
      return;
    }
    console.log(`[CID] msg=${message.id} cidAtts.length=${cidAtts.length}`);

    try {
      // IMAP batch path: one Rust command for all uncached IMAP CIDs.
      // Binary data stays in Rust → disk; JS receives only file paths.
      // Single tokio task → same jemalloc arena → no MADV_FREE accumulation.
      const imapUncached = cidAtts.filter((a) => a.imap_part_id && !a.local_path);
      if (imapUncached.length > 0) {
        try {
          const { resolveImapCidImages } = await import(
            "@/services/imap/imapCidResolver"
          );
          const pathMap = await resolveImapCidImages(
            message.account_id,
            message.id,
            imapUncached,
          );
          for (const att of imapUncached) {
            const resolved = pathMap.get(att.id);
            if (resolved) att.local_path = resolved;
          }
        } catch (e) {
          // Log so we know WHY the batch failed instead of silently falling through.
          console.error(`[CID] batch resolver threw for msg=${message.id}:`, e);
        }
      }

      // Resolve appDataDir once — it's an async IPC call, do it outside the map.
      const [{ convertFileSrc }, { appDataDir }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/path"),
      ]);
      const baseDir = await appDataDir();
      const sep = baseDir.endsWith("/") ? "" : "/";

      const [{ getEmailProvider }, { cacheAttachment }] = await Promise.all([
        import("@/services/email/providerFactory"),
        import("@/services/attachments/cacheManager"),
      ]);

      const results = await Promise.all(cidAtts.map(async (att) => {
        const cidKey = att.content_id!.replace(/[<>]/g, "").trim();

        // Fast path: file already on disk → WebKit native IO, zero JS heap alloc.
        if (att.local_path) {
          return {
            cidKey,
            dataUri: convertFileSrc(`${baseDir}${sep}${att.local_path}`),
          };
        }

        // IMAP attachments MUST NOT reach `provider.fetchAttachment` here.
        // For IMAP that call hits `imap_fetch_attachment` Rust command which uses
        // `BODY.PEEK[part_id]` — and DavMail (Exchange/EWS → IMAP gateway) mangles
        // that response, sending async-imap's parser into an unbounded buffer loop
        // (32 GB RSS in seconds). The only sanctioned IMAP CID path is the batch
        // resolver above, which uses BODY.PEEK[] + mail-parser. If we got here for
        // an IMAP attachment, the batch resolver already failed or didn't set
        // local_path — fall back to a placeholder instead of triggering the crash.
        if (att.imap_part_id) {
          console.warn(
            `[CID] IMAP attachment ${att.id} not resolved by batch — showing placeholder`,
          );
          return { cidKey, dataUri: null as string | null };
        }

        // Gmail-only path: provider.fetchAttachment here is the Gmail HTTPS API,
        // not IMAP. Safe to call.
        const attachmentId = att.gmail_attachment_id!;
        await _acquireImapSlot();
        try {
          const provider = await getEmailProvider(message.account_id);
          let result;
          try {
            result = await provider.fetchAttachment(message.id, attachmentId);
          } catch {
            try {
              result = await provider.fetchAttachment(message.id, attachmentId);
            } catch {
              return { cidKey, dataUri: null as string | null };
            }
          }
          const base64 = result.data.includes("-") || result.data.includes("_")
            ? result.data.replace(/-/g, "+").replace(/_/g, "/")
            : result.data;
          const relPath = await cacheAttachment(att.id, base64ToUint8Array(base64));
          return {
            cidKey,
            dataUri: convertFileSrc(`${baseDir}${sep}${relPath}`),
          };
        } finally {
          _releaseImapSlot();
        }
      }));

      const newMap = new Map<string, string>();
      const failed: string[] = [];
      for (const { cidKey, dataUri } of results) {
        if (dataUri) newMap.set(cidKey, dataUri);
        else failed.push(cidKey);
      }

      if (newMap.size > 0) setCidMap(newMap);
      if (failed.length > 0) setCidFailed(new Set(failed));
      console.timeEnd(`[CID] ${message.id}`);
      console.log(`[CID] done msg=${message.id} resolved=${newMap.size} failed=${failed.length}`);
    } catch (e) {
      console.error(`[CID] error msg=${message.id}`, e);
      try { console.timeEnd(`[CID] ${message.id}`); } catch {}
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

  const handleToggle = async () => {
    const willExpand = !expanded;
    if (willExpand && (message.body_html === null && message.body_text === null)) {
      await onNeedBody?.();
    }
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
              key={message.id}
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

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

