import { useEffect, useState, useRef, useCallback } from "react";
import { MessageItem } from "./MessageItem";
import { ActionBar } from "./ActionBar";
import {
  getMessagesForThread,
  getMessagesMetaForThread,
  getMessageBody,
  type DbMessage,
} from "@/services/db/messages";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useComposerStore } from "@/stores/composerStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { markThreadRead } from "@/services/emailActions";
import { getSetting } from "@/services/db/settings";
import { getAllowlistedSenders } from "@/services/db/imageAllowlist";
import { normalizeEmail } from "@/utils/emailUtils";
import { VolumeX } from "lucide-react";
import { escapeHtml, sanitizeHtml } from "@/utils/sanitize";
import { isNoReplyAddress } from "@/utils/noReply";
import { getDefaultSignature } from "@/services/db/signatures";
import { ThreadSummary } from "./ThreadSummary";
import { SmartReplySuggestions } from "./SmartReplySuggestions";
import { InlineReply } from "./InlineReply";
import { ContactSidebar } from "./ContactSidebar";
import { TaskSidebar } from "@/components/tasks/TaskSidebar";
import { AiTaskExtractDialog } from "@/components/tasks/AiTaskExtractDialog";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { MessageSkeleton } from "@/components/ui/Skeleton";
import { RawMessageModal } from "./RawMessageModal";

const INITIAL_MESSAGES_TO_SHOW = 20;

interface ThreadViewProps {
  thread: Thread;
}

async function handlePopOut(thread: Thread) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const windowLabel = `thread-${thread.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const url = `index.html?thread=${encodeURIComponent(thread.id)}&account=${encodeURIComponent(thread.accountId)}`;

    // Check if window already exists
    const existing = await WebviewWindow.getByLabel(windowLabel);
    if (existing) {
      await existing.setFocus();
      return;
    }

    const win = new WebviewWindow(windowLabel, {
      url,
      title: thread.subject ?? "Thread",
      width: 800,
      height: 700,
      center: true,
      dragDropEnabled: false,
      // @ts-ignore - titleBarStyle is valid for macOS in Tauri 2
      titleBarStyle: "Overlay",
    });

    win.once("tauri://error", (e) => {
      console.error("Failed to create pop-out window:", e);
    });
  } catch (err) {
    console.error("Failed to open pop-out window:", err);
  }
}

export function ThreadView({ thread }: ThreadViewProps) {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const contactSidebarVisible = useUIStore((s) => s.contactSidebarVisible);
  const toggleContactSidebar = useUIStore((s) => s.toggleContactSidebar);
  const taskSidebarVisible = useUIStore((s) => s.taskSidebarVisible);
  const [showTaskExtract, setShowTaskExtract] = useState(false);
const updateThread = useThreadStore((s) => s.updateThread);
   const storeSelectedMessageId = useThreadStore((s) => s.selectedMessageId);
   const [messages, setMessages] = useState<DbMessage[]>([]);
   const [selectedMessageId, setLocalSelectedMessageId] = useState<string | null>(null);
   const storeSetSelectedMessageId = useThreadStore((s) => s.setSelectedMessageId);
   const setSelectedMessageId = useCallback((id: string | null) => {
     setLocalSelectedMessageId(id);
     storeSetSelectedMessageId(id);
   }, [storeSetSelectedMessageId]);
  const [loading, setLoading] = useState(true);
  const markedReadRef = useRef<string | null>(null);
  // null = not yet loaded; defer iframe rendering until setting is known
  const [blockImages, setBlockImages] = useState<boolean | null>(null);
  const [allowlistedSenders, setAllowlistedSenders] = useState<Set<string>>(new Set());

  // Preload settings eagerly on mount (parallel with message loading)
  useEffect(() => {
    getSetting("block_remote_images").then((val) => setBlockImages(val !== "false"));
  }, []);

// Load messages — lean first (no body), then immediately patch body for the last message.
   // This mirrors Thunderbird's msgHdr vs body separation: avoid loading all bodies upfront.
   useEffect(() => {
     if (!activeAccountId) return;
     setLoading(true);
     getMessagesMetaForThread(activeAccountId, thread.id)
       .then(async (msgs) => {
         // Patch body for the last message immediately (it's the only one expanded by default)
          const last = msgs[msgs.length - 1];
          if (last) {
            let body = await getMessageBody(activeAccountId, last.id);
            if (body.is_truncated === 1) {
              try {
                const { getEmailProvider } = await import("@/services/email/providerFactory");
                const { upsertMessage } = await import("@/services/db/messages");
                const provider = await getEmailProvider(activeAccountId);
                const fullMsg = await provider.fetchMessage(last.id);
                if (fullMsg) {
                  await upsertMessage({
                    ...fullMsg,
                    accountId: activeAccountId,
                    isTruncated: false,
                  });
                  body = {
                    body_html: fullMsg.bodyHtml,
                    body_text: fullMsg.bodyText,
                    is_truncated: 0,
                  };
                }
              } catch (err) {
                console.error("[ThreadView] Failed to lazy-fetch last message body:", err);
              }
            }
            if (body.body_html || body.body_text) {
              msgs = msgs.map((m) => (m.id === last.id ? { ...m, ...body } : m));
            }
          }
         setMessages(msgs);
         if (storeSelectedMessageId && msgs.some(m => m.id === storeSelectedMessageId)) {
           setLocalSelectedMessageId(storeSelectedMessageId);
         }
       })
       .catch(console.error)
       .finally(() => setLoading(false));
   }, [activeAccountId, thread.id]);

// Check per-sender allowlist (single batch query instead of N queries)
   useEffect(() => {
     if (!activeAccountId || messages.length === 0) return;
     let cancelled = false;

     const senders: string[] = [];
     for (const msg of messages) {
       if (msg.from_address) senders.push(msg.from_address);
     }
     const uniqueSenders = [...new Set(senders)];

     getAllowlistedSenders(activeAccountId, uniqueSenders).then((allowed) => {
       if (!cancelled) setAllowlistedSenders(allowed);
     });

     return () => { cancelled = true; };
   }, [activeAccountId, messages]);

   // Update selected message when store value changes (e.g., from citation click)
   useEffect(() => {
     if (storeSelectedMessageId && messages.some(m => m.id === storeSelectedMessageId)) {
       setLocalSelectedMessageId(storeSelectedMessageId);
     }
   }, [storeSelectedMessageId, messages]);

  // Auto-mark unread threads as read when opened (respects mark-as-read setting)
  const markAsReadBehavior = useUIStore((s) => s.markAsReadBehavior);
  useEffect(() => {
    if (!activeAccountId || thread.isRead || markedReadRef.current === thread.id) return;
    if (markAsReadBehavior === "manual") return;

    const markRead = () => {
      markedReadRef.current = thread.id;
      markThreadRead(activeAccountId, thread.id, [], true).catch((err) => {
        console.error("Failed to mark thread as read:", err);
      });
    };

    if (markAsReadBehavior === "2s") {
      const timer = setTimeout(markRead, 2000);
      return () => clearTimeout(timer);
    }

    // instant
    markRead();
  }, [activeAccountId, thread.id, thread.isRead, updateThread, markAsReadBehavior]);

  const openComposer = useComposerStore((s) => s.openComposer);
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const defaultReplyMode = useUIStore((s) => s.defaultReplyMode);
  const lastMessage = messages[messages.length - 1];

  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.id === activeAccountId);

// Get selected message - either explicitly selected or last message as fallback
  const selectedMessage = messages.find(m => m.id === selectedMessageId) || lastMessage;

  // Fetch and patch body for a single message into the messages state
  const loadBodyForMessage = useCallback(async (messageId: string) => {
    if (!activeAccountId) return;
    let body = await getMessageBody(activeAccountId, messageId);
    if (!body) return;

    // If truncated (IMAP optimization), fetch full body from server and update DB
    if (body.is_truncated === 1) {
      try {
        const { getEmailProvider } = await import("@/services/email/providerFactory");
        const { upsertMessage } = await import("@/services/db/messages");
        const provider = await getEmailProvider(activeAccountId);
        const fullMsg = await provider.fetchMessage(messageId);
        
        if (fullMsg) {
          await upsertMessage({
            ...fullMsg,
            accountId: activeAccountId,
            isTruncated: false
          });
          body = {
            body_html: fullMsg.bodyHtml,
            body_text: fullMsg.bodyText,
            is_truncated: 0
          };
        }
      } catch (err) {
        console.error("[ThreadView] Failed to lazy-fetch full message body:", err);
      }
    }

    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, ...body } : m));
  }, [activeAccountId]);

  // For reply/forward/export/print: ensure all messages have bodies loaded before proceeding
  const ensureFullMessages = useCallback(async (): Promise<DbMessage[]> => {
    if (!activeAccountId) return messages;
    const needsFetch = messages.some((m) => m.body_html === null && m.body_text === null);
    if (!needsFetch) return messages;
    return getMessagesForThread(activeAccountId, thread.id);
  }, [messages, activeAccountId, thread.id]);

  const handleReply = useCallback(async () => {
    if (!selectedMessage) return;
    const fullMessages = await ensureFullMessages();
    const replyTo = selectedMessage.reply_to ?? selectedMessage.from_address;
    const msgIndex = fullMessages.findIndex(m => m.id === selectedMessage.id);
    const quotedMessages = msgIndex >= 0 ? fullMessages.slice(0, msgIndex + 1) : fullMessages;
    openComposer({
      mode: "reply",
      to: replyTo ? [replyTo] : [],
      subject: `Re: ${selectedMessage.subject ?? ""}`,
      quotedHtml: buildThreadQuote(quotedMessages),
      threadId: selectedMessage.thread_id,
      inReplyToMessageId: selectedMessage.id,
    });
  }, [selectedMessage, ensureFullMessages, openComposer]);

  const handleReplyAll = useCallback(async () => {
    if (!selectedMessage || !activeAccount) return;
    const fullMessages = await ensureFullMessages();
    const replyTo = selectedMessage.reply_to ?? selectedMessage.from_address;
    const allRecipients = new Set<string>();
    if (replyTo) allRecipients.add(replyTo);

    const myEmails = new Set(accounts.map((a) => normalizeEmail(a.email)));

    if (selectedMessage.to_addresses) {
      selectedMessage.to_addresses.split(",").forEach((a) => {
        const trimmed = a.trim();
        if (trimmed && !myEmails.has(normalizeEmail(trimmed))) {
          allRecipients.add(trimmed);
        }
      });
    }

    for (const email of myEmails) {
      allRecipients.delete(email);
    }

    const ccList: string[] = [];
    if (selectedMessage.cc_addresses) {
      selectedMessage.cc_addresses.split(",").forEach((a) => {
        const trimmed = a.trim();
        if (trimmed && !myEmails.has(normalizeEmail(trimmed))) {
          ccList.push(trimmed);
        }
      });
    }

    const msgIndex = fullMessages.findIndex(m => m.id === selectedMessage.id);
    const quotedMessages = msgIndex >= 0 ? fullMessages.slice(0, msgIndex + 1) : fullMessages;

    openComposer({
      mode: "replyAll",
      to: Array.from(allRecipients).filter(r => !myEmails.has(normalizeEmail(r))),
      cc: ccList,
      subject: `Re: ${selectedMessage.subject ?? ""}`,
      quotedHtml: buildThreadQuote(quotedMessages),
      threadId: selectedMessage.thread_id,
      inReplyToMessageId: selectedMessage.id,
    });
  }, [selectedMessage, ensureFullMessages, openComposer, activeAccount, accounts]);

const handleForward = useCallback(async () => {
    if (!selectedMessage) return;
    const fullMessages = await ensureFullMessages();
    const msgIndex = fullMessages.findIndex(m => m.id === selectedMessage.id);
    const quotedMessages = msgIndex >= 0 ? fullMessages.slice(0, msgIndex + 1) : fullMessages;
    openComposer({
      mode: "forward",
      to: [],
      subject: `Fwd: ${selectedMessage.subject ?? ""}`,
      quotedHtml: buildThreadForwardQuote(quotedMessages),
      threadId: selectedMessage.thread_id,
      inReplyToMessageId: selectedMessage.id,
    });
  }, [selectedMessage, ensureFullMessages, openComposer]);

const handlePrint = useCallback(async () => {
    if (messages.length === 0) {
      console.warn("No messages to print");
      return;
    }

    const messageToPrint = selectedMessage || lastMessage;
    if (!messageToPrint) return;

    const date = new Date(messageToPrint.date).toLocaleString();
    const from = messageToPrint.from_name
      ? `${escapeHtml(messageToPrint.from_name)} &lt;${escapeHtml(messageToPrint.from_address ?? "")}&gt;`
      : escapeHtml(messageToPrint.from_address ?? "Unknown");
    const to = escapeHtml(messageToPrint.to_addresses ?? "");
    const cc = messageToPrint.cc_addresses ? escapeHtml(messageToPrint.cc_addresses) : "";
    const body = messageToPrint.body_html ? sanitizeHtml(messageToPrint.body_html) : escapeHtml(messageToPrint.body_text ?? "");

    let signatureHtml = "";
    try {
      const sig = await getDefaultSignature(activeAccountId ?? "");
      if (sig) signatureHtml = sig.body_html;
    } catch {
      // ignore
    }

    const printHtml = `
      <div style="margin-bottom:16px;color:#666;font-size:12px">
        <strong>From:</strong> ${from}<br/>
        <strong>To:</strong> ${to}${cc ? `<br/><strong>Cc:</strong> ${cc}` : ''}<br/>
        <strong>Date:</strong> ${date}
      </div>
      <div style="font-size:14px;line-height:1.6">${body}${signatureHtml ? `<div style="margin-top:24px;border-top:1px solid #ddd;padding-top:12px">${signatureHtml}</div>` : ''}</div>
    `;

    const dateObj = new Date(messageToPrint.date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const sender = messageToPrint.from_name || messageToPrint.from_address || "Unknown";
    const subjectTitle = messageToPrint.subject || thread.subject || "No Subject";
    const printTitle = `${yyyy}.${mm}.${dd} - ${sender} - ${subjectTitle}`;

    const safeSubject = escapeHtml(thread.subject ?? "");

    const printDiv = document.createElement("div");
    printDiv.id = "velo-print-content";
    printDiv.innerHTML = `
      <div style="margin-top: 0 !important; padding-top: 0 !important;">
        <h1 style="font-size:20px; margin-top: 0 !important; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px;">${safeSubject || "(No subject)"}</h1>
        ${printHtml}
      </div>
    `;
    document.body.appendChild(printDiv);

    const style = document.createElement("style");
    style.id = "velo-print-styles";
    style.textContent = `
      @page {
        margin: 10mm 15mm 15mm 15mm !important; /* Applica i margini a TUTTE le pagine (Top Right Bottom Left) */
      }

      @media print {
        body > *:not(#velo-print-content) {
          display: none !important;
        }

        #velo-print-content {
          display: block !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important; /* Rimuoviamo il padding che si applicava solo all'inizio e fine del blocco */
          box-sizing: border-box !important;
          background: white !important;
          color: black !important;
        }

        html, body {
          background: white !important;
          background-image: none !important;
          overflow: visible !important;
          height: auto !important;
          min-height: auto !important;
          position: static !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        #velo-print-content img {
          max-width: 100% !important;
          height: auto !important;
        }
      }

      @media screen {
        #velo-print-content { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    const oldTitle = document.title;
    document.title = printTitle;

    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error("Print failed:", err);
      }
    }, 250);

    const cleanup = () => {
      const printContent = document.getElementById("velo-print-content");
      const printStyles = document.getElementById("velo-print-styles");
      if (printContent) printContent.remove();
      if (printStyles) printStyles.remove();
      document.title = oldTitle;
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    // Increased to 5 minutes so it doesn't destroy the DOM before "Save as PDF" completes
    setTimeout(cleanup, 300000);
  }, [messages, thread.subject, selectedMessage, lastMessage, activeAccountId]);

  // Message-level keyboard navigation (ArrowUp / ArrowDown)
  const [focusedMsgIdx, setFocusedMsgIdx] = useState(-1);
  const messageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Reset focused index when thread changes
  useEffect(() => {
    setFocusedMsgIdx(-1);
    setSelectedMessageId(null);
  }, [thread.id]);

  // Scroll focused message into view
  useEffect(() => {
    if (focusedMsgIdx >= 0 && messageRefs.current[focusedMsgIdx]) {
      messageRefs.current[focusedMsgIdx]!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedMsgIdx]);

  // Arrow key handler for message navigation (only in full-screen thread view)
  // In split-pane mode, arrows navigate the thread list instead (handled by useKeyboardShortcuts)
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  useEffect(() => {
    if (readingPanePosition !== "hidden") return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (isInputFocused) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedMsgIdx((prev) => {
          const next = prev + 1;
          return next < messages.length ? next : prev;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedMsgIdx((prev) => {
          const next = prev - 1;
          return next >= 0 ? next : prev;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messages.length, readingPanePosition]);

  const [visibleStart, setVisibleStart] = useState(0);

  // Reset visible window when thread changes
  useEffect(() => {
    setVisibleStart(0);
  }, [thread.id]);

  // Compute visible slice — always shows last INITIAL_MESSAGES_TO_SHOW messages,
  // expanding upward when the user loads earlier messages.
  const visibleMessages = messages.length <= INITIAL_MESSAGES_TO_SHOW
    ? messages
    : messages.slice(messages.length - INITIAL_MESSAGES_TO_SHOW - visibleStart);

  const hiddenCount = messages.length - visibleMessages.length;

  const [rawMessageTarget, setRawMessageTarget] = useState<{
    messageId: string;
    accountId: string;
  } | null>(null);

  // Reload message list when a single message is deleted within this thread
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { messageId: string; threadId: string };
      if (detail.threadId !== thread.id || !activeAccountId) return;
      getMessagesForThread(activeAccountId, thread.id)
        .then((msgs) => {
          setMessages(msgs);
          setSelectedMessageId(null);
        })
        .catch(console.error);
    };
    window.addEventListener("velo-message-deleted", handler);
    return () => window.removeEventListener("velo-message-deleted", handler);
  }, [thread.id, activeAccountId, setSelectedMessageId]);

  // Listen for "View Source" event from context menu
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        messageId: string;
        accountId: string;
      };
      setRawMessageTarget(detail);
    };
    window.addEventListener("velo-view-raw-message", handler);
    return () => window.removeEventListener("velo-view-raw-message", handler);
  }, []);

  // Listen for extract-task event from keyboard shortcut
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { threadId: string } | undefined;
      if (detail?.threadId === thread.id) {
        setShowTaskExtract(true);
      }
    };
    window.addEventListener("velo-extract-task", handler);
    return () => window.removeEventListener("velo-extract-task", handler);
  }, [thread.id]);

  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: DbMessage) => {
    e.preventDefault();
    openMenu("message", { x: e.clientX, y: e.clientY }, {
      messageId: msg.id,
      threadId: msg.thread_id,
      accountId: msg.account_id,
      fromAddress: msg.from_address,
      fromName: msg.from_name,
      replyTo: msg.reply_to,
      toAddresses: msg.to_addresses,
      ccAddresses: msg.cc_addresses,
      subject: msg.subject,
      date: msg.date,
      bodyHtml: msg.body_html,
      bodyText: msg.body_text,
    });
  }, [openMenu]);

  const handleExport = useCallback(async () => {
    if (messages.length === 0) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");

      const fullMessages = await ensureFullMessages();
      const emlParts = fullMessages.map((msg) => {
        const date = new Date(msg.date).toUTCString();
        const from = msg.from_name
          ? `${msg.from_name} <${msg.from_address}>`
          : (msg.from_address ?? "");
        const lines = [
          `From: ${from}`,
          `To: ${msg.to_addresses ?? ""}`,
          msg.cc_addresses ? `Cc: ${msg.cc_addresses}` : null,
          `Subject: ${msg.subject ?? ""}`,
          `Date: ${date}`,
          `Message-ID: <${msg.id}>`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=UTF-8`,
          ``,
          msg.body_html ?? msg.body_text ?? "",
        ].filter((l): l is string => l !== null);
        return lines.join("\r\n");
      });

      const content = emlParts.join("\r\n\r\n");
      const defaultName = `${(thread.subject ?? "email").replace(/[^a-zA-Z0-9_-]/g, "_")}.eml`;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "Email", extensions: ["eml"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } catch (err) {
      console.error("Failed to export thread:", err);
    }
  }, [messages, thread.subject]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
      </div>
    );
  }

  // Detect no-reply senders — disable reply buttons but still allow forward
  const noReply = isNoReplyAddress(lastMessage?.reply_to ?? lastMessage?.from_address);

  const primarySender = selectedMessage?.from_address ?? null;
  const primarySenderName = selectedMessage?.from_name ?? null;

  return (
    <div className="flex h-full @container relative">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Unified action bar */}
        <ActionBar
          thread={thread}
          messages={messages}
          noReply={noReply}
          defaultReplyMode={defaultReplyMode}
          contactSidebarVisible={contactSidebarVisible}
          taskSidebarVisible={taskSidebarVisible}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onPrint={handlePrint}
          onExport={handleExport}
          onPopOut={() => handlePopOut(thread)}
          onToggleContactSidebar={toggleContactSidebar}
          onToggleTaskSidebar={() => useUIStore.getState().toggleTaskSidebar()}
        />

        {/* Thread subject */}
        <div data-tauri-drag-region className="px-6 py-3 border-b border-border-primary">
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            {thread.subject ?? "(No subject)"}
            {thread.isMuted && (
              <span className="text-warning shrink-0" title="Muted">
                <VolumeX size={16} />
              </span>
            )}
          </h1>
          <div className="text-xs text-text-tertiary mt-1">
            {messages.length} message{messages.length !== 1 ? "s" : ""} in this thread
          </div>
        </div>

        {/* AI Summary */}
        {activeAccountId && (
          <ThreadSummary
            threadId={thread.id}
            accountId={activeAccountId}
            messages={messages}
          />
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary name="MessageList">
            {hiddenCount > 0 && (
              <div className="px-6 py-3 border-b border-border-secondary">
                <button
                  onClick={() => setVisibleStart((s) => s + INITIAL_MESSAGES_TO_SHOW)}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  Load {Math.min(hiddenCount, INITIAL_MESSAGES_TO_SHOW)} earlier message{Math.min(hiddenCount, INITIAL_MESSAGES_TO_SHOW) !== 1 ? "s" : ""} ({hiddenCount} hidden)
                </button>
              </div>
            )}
            {visibleMessages.map((msg, i) => {
              const globalIdx = messages.length - visibleMessages.length + i;
              return (
                <MessageItem
                  key={msg.id}
                  ref={(el) => { messageRefs.current[globalIdx] = el; }}
                  message={msg}
                  isLast={globalIdx === messages.length - 1}
                  focused={globalIdx === focusedMsgIdx}
                  onSelect={setSelectedMessageId}
                  onNeedBody={() => loadBodyForMessage(msg.id)}
                  blockImages={blockImages}
                  senderAllowlisted={msg.from_address ? allowlistedSenders.has(normalizeEmail(msg.from_address)) : false}
                  isSpam={thread.labelIds.includes("SPAM")}
                  onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                />
              );
            })}
          </ErrorBoundary>

          {/* Smart Reply Suggestions */}
          {activeAccountId && messages.length > 0 && (
            <SmartReplySuggestions
              threadId={thread.id}
              accountId={activeAccountId}
              messages={messages}
              noReply={noReply}
            />
          )}

          {/* Inline Reply */}
          {activeAccountId && (
            <InlineReply
              thread={thread}
              messages={messages}
              accountId={activeAccountId}
              noReply={noReply}
              onSent={() => {
                // Reload messages after sending
                getMessagesForThread(activeAccountId, thread.id)
                  .then(setMessages)
                  .catch(console.error);
              }}
            />
          )}
        </div>
      </div>

      {/* Contact sidebar — overlay at narrow widths, inline at wide */}
      {contactSidebarVisible && primarySender && activeAccountId && (
        <>
          {/* Backdrop for overlay mode (narrow widths) */}
          <div
            className="absolute inset-0 z-10 bg-black/20 @[640px]:hidden"
            onClick={toggleContactSidebar}
          />
          <div className="absolute right-0 top-0 bottom-0 z-20 shadow-xl @[640px]:relative @[640px]:z-auto @[640px]:shadow-none">
            <ContactSidebar
              email={primarySender}
              name={primarySenderName}
              accountId={activeAccountId}
              onClose={toggleContactSidebar}
            />
          </div>
        </>
      )}

      {/* Task sidebar */}
      {taskSidebarVisible && activeAccountId && (
        <TaskSidebar accountId={activeAccountId} threadId={thread.id} messages={messages} />
      )}

      {/* Raw message source modal */}
      {rawMessageTarget && (
        <RawMessageModal
          isOpen={true}
          onClose={() => setRawMessageTarget(null)}
          messageId={rawMessageTarget.messageId}
          accountId={rawMessageTarget.accountId}
        />
      )}

      {/* AI Task Extraction Dialog */}
      {showTaskExtract && activeAccountId && (
        <AiTaskExtractDialog
          threadId={thread.id}
          accountId={activeAccountId}
          messages={messages}
          onClose={() => setShowTaskExtract(false)}
        />
      )}
    </div>
  );
}

function buildThreadQuote(msgs: DbMessage[]): string {
  if (msgs.length === 0) return "";
  return "<br><br>" + [...msgs].reverse().map(msg => {
    const date = new Date(msg.date).toLocaleString();
    const from = msg.from_name
      ? `${escapeHtml(msg.from_name)} &lt;${escapeHtml(msg.from_address ?? "")}&gt;`
      : escapeHtml(msg.from_address ?? "Unknown");
    const body = msg.body_html ? sanitizeHtml(msg.body_html) : escapeHtml(msg.body_text ?? "");
    return `<div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666;margin-bottom:8px">On ${date}, ${from} wrote:<br>${body}</div>`;
  }).join("");
}

function buildThreadForwardQuote(msgs: DbMessage[]): string {
  if (msgs.length === 0) return "";
  const parts = msgs.map(msg => {
    const date = new Date(msg.date).toLocaleString();
    const body = msg.body_html ? sanitizeHtml(msg.body_html) : escapeHtml(msg.body_text ?? "");
    return `From: ${escapeHtml(msg.from_name ?? "")} &lt;${escapeHtml(msg.from_address ?? "")}&gt;<br>Date: ${date}<br>Subject: ${escapeHtml(msg.subject ?? "")}<br>To: ${escapeHtml(msg.to_addresses ?? "")}<br><br>${body}`;
  });
  return `<br><br>---------- Forwarded message ---------<br><br>${parts.join("<br><br>---------- Previous message ---------<br><br>")}`;
}
