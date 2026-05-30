import { memo, useState, useRef, useEffect, useMemo, useCallback, forwardRef } from "react";
import { formatFullDate } from "@/utils/date";
import { EmailRenderer } from "./EmailRenderer";
import { InlineAttachmentPreview } from "./InlineAttachmentPreview";
import { AttachmentList, getAttachmentsForMessage } from "./AttachmentList";
import { CalendarInviteWidget } from "./CalendarInviteWidget";
import type { DbMessage } from "@/services/db/messages";
import type { DbAttachment } from "@/services/db/attachments";
import { MailMinus, Reply, ReplyAll, Forward, Trash2, Paperclip } from "lucide-react";
import { AuthBadge } from "./AuthBadge";
import { AuthWarningBanner } from "./AuthWarningBanner";
import { isCalendarInvite } from "@/utils/fileTypeHelpers";
import { useAccountStore } from "@/stores/accountStore";
import { useContactsStore } from "@/stores/contactsStore";
import { useUIStore } from "@/stores/uiStore";
import { t } from "@/i18n";

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
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onMarkRead?: () => void;
}

export const MessageItem = memo(forwardRef<HTMLDivElement, MessageItemProps>(function MessageItem({ message, isLast, blockImages, senderAllowlisted, accountId, threadId, isSpam, focused, onSelect, onNeedBody, onContextMenu, onReply, onReplyAll, onForward, onDelete, onMarkRead }, ref) {
  const [expanded, setExpanded] = useState(isLast);
  const wasUnreadRef = useRef(message.is_read === 0);
  const [attachments, setAttachments] = useState<DbAttachment[]>([]);
  const [authBannerDismissed, setAuthBannerDismissed] = useState(false);
  const [cidMap, setCidMap] = useState<Map<string, string>>(new Map());
  const [cidFailed, setCidFailed] = useState<Set<string>>(new Set());
  const attachmentsLoadedRef = useRef(false);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerContainerRef = useRef<HTMLDivElement>(null);
  const account = useAccountStore((s) => s.accounts.find((a) => a.id === (accountId ?? message.account_id)));
  const markAsReadBehavior = useUIStore((s) => s.markAsReadBehavior);

  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    (observerContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  }, [ref]);

  const resolveCidImages = async (atts: DbAttachment[]) => {
    const html = message.body_html;
    if (!html || !/\bcid:/i.test(html)) return;

    const cidAtts = atts.filter(
      (a) => a.content_id && (a.gmail_attachment_id || a.imap_part_id) &&
        new RegExp(`cid:${escapeCid(a.content_id)}`, "i").test(html),
    );
    if (cidAtts.length === 0) return;

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
        } catch {
          // Non-fatal — images will show placeholders below.
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
    } catch {
      // Silently fall back to placeholders for any unexpected failure.
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

  // Per-message read tracking: mark as read when visible in viewport for configured duration
  useEffect(() => {
    if (!onMarkRead || message.is_read !== 0 || markAsReadBehavior === "manual" || !expanded) return;
    const el = observerContainerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          const delay = markAsReadBehavior === "2s" ? 2000 : 0;
          readTimerRef.current = setTimeout(() => {
            observer.disconnect();
            onMarkRead();
          }, delay);
        } else {
          if (readTimerRef.current !== null) {
            clearTimeout(readTimerRef.current);
            readTimerRef.current = null;
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (readTimerRef.current !== null) {
        clearTimeout(readTimerRef.current);
        readTimerRef.current = null;
      }
    };
  }, [message.is_read, markAsReadBehavior, onMarkRead, expanded]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const calendarAttachment = useMemo(
    () => attachments.find((a) => isCalendarInvite(a.mime_type, a.filename)),
    [attachments],
  );

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

  const contactsMap = useContactsStore((s) => s.contactsMap);
  const fromDisplay =
    (message.from_address && contactsMap[message.from_address.toLowerCase()]) ||
    message.from_name ||
    message.from_address ||
    t("messageItem.unknown");

  const showUnread = wasUnreadRef.current && !expanded;

  const hasActions = !!(onReply || onReplyAll || onForward || onDelete);

  return (
    <div
      ref={mergedRef}
      className={`border-b border-border-secondary last:border-b-0 border-l-2 transition-colors group
        ${showUnread ? "border-l-accent" : "border-l-transparent"}
        ${isSpam ? "bg-red-500/8 dark:bg-red-500/10" : ""}
        ${focused ? "ring-2 ring-inset ring-accent/50" : ""}`}
      onContextMenu={onContextMenu}
    >
      {/* Header — always visible, click to expand/collapse */}
      <div className="relative">
        <button
          onClick={handleToggle}
          className="w-full text-left px-4 py-3 hover:bg-bg-hover transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium transition-colors
                ${showUnread ? "bg-accent text-white" : "bg-accent/20 text-accent"}`}>
                {fromDisplay[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className={`text-sm truncate flex items-center gap-1 transition-all
                  ${showUnread ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}>
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
            <div className={`flex items-center gap-1.5 shrink-0 ml-2 ${hasActions ? "group-hover:invisible" : ""}`}>
              {!expanded && !!message.has_attachments && (
                <span className="text-text-tertiary" title={t("threadCard.hasAttachments")}>
                  <Paperclip size={12} />
                </span>
              )}
              <span className="text-xs text-text-tertiary whitespace-nowrap">
                {formatFullDate(message.date)}
              </span>
            </div>
          </div>
        {expanded && (
          <div className="mt-1 text-xs text-text-tertiary space-y-0.5">
            {message.to_addresses && (
              <div><span className="text-text-secondary">{t("messageItem.to")}</span> {message.to_addresses}</div>
            )}
            {message.cc_addresses && (
              <div><span className="text-text-secondary">{t("messageItem.cc")}</span> {message.cc_addresses}</div>
            )}
            {message.bcc_addresses && message.from_address?.toLowerCase() === account?.email.toLowerCase() && (
              <div><span className="text-text-secondary">{t("messageItem.bcc")}</span> {message.bcc_addresses}</div>
            )}
          </div>
        )}
      </button>

      {/* Per-message action buttons — visible on hover, overlaid over date */}
      {hasActions && (
        <div className="hidden group-hover:flex absolute top-3 right-4 items-center gap-0.5 bg-bg-primary/90 rounded-md shadow-sm border border-border-secondary px-0.5 py-0.5 z-10">
          {onReplyAll && (
            <button
              onClick={(e) => { e.stopPropagation(); onReplyAll(); }}
              className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title={t("actionBar.replyAll")}
            >
              <ReplyAll size={13} />
            </button>
          )}
          {onReply && (
            <button
              onClick={(e) => { e.stopPropagation(); onReply(); }}
              className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title={t("actionBar.reply")}
            >
              <Reply size={13} />
            </button>
          )}
          {onForward && (
            <button
              onClick={(e) => { e.stopPropagation(); onForward(); }}
              className="p-1 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
              title={t("actionBar.forward")}
            >
              <Forward size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
              title={t("actionBar.deleteMessage")}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
      </div>

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

          {calendarAttachment && account && (
            <CalendarInviteWidget
              attachment={calendarAttachment}
              messageId={message.id}
              threadId={threadId ?? message.thread_id}
              account={account}
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
            <div className="py-8 text-center text-text-tertiary text-sm">{t("messageItem.loading")}</div>
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
            attachments={calendarAttachment ? attachments.filter((a) => a.id !== calendarAttachment.id) : attachments}
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
      {status === "loading" && t("messageItem.unsubscribing")}
      {status === "done" && t("messageItem.unsubscribed")}
      {status === "failed" && t("messageItem.unsubscribeFailed")}
      {status === "idle" && t("messageItem.unsubscribe")}
    </button>
  );
}

