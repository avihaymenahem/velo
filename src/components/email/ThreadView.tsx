import { useEffect, useState, useRef, useCallback } from "react";
import { MessageItem } from "./MessageItem";
import { ActionBar } from "./ActionBar";
import { getMessagesForThread, type DbMessage } from "@/services/db/messages";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useComposerStore } from "@/stores/composerStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { getSetting } from "@/services/db/settings";
import { isAllowlisted } from "@/services/db/imageAllowlist";
import { ExternalLink, Reply, ReplyAll, Forward, Printer, Download, PanelRightClose, PanelRightOpen } from "lucide-react";
import { escapeHtml, sanitizeHtml } from "@/utils/sanitize";
import { isNoReplyAddress } from "@/utils/noReply";
import { ThreadSummary } from "./ThreadSummary";
import { SmartReplySuggestions } from "./SmartReplySuggestions";
import { InlineReply } from "./InlineReply";
import { ContactSidebar } from "./ContactSidebar";

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
  const updateThread = useThreadStore((s) => s.updateThread);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const markedReadRef = useRef<string | null>(null);
  // null = not yet loaded; defer iframe rendering until setting is known
  const [blockImages, setBlockImages] = useState<boolean | null>(null);
  const [allowlistedSenders, setAllowlistedSenders] = useState<Set<string>>(new Set());

  // Preload settings eagerly on mount (parallel with message loading)
  useEffect(() => {
    getSetting("block_remote_images").then((val) => setBlockImages(val !== "false"));
  }, []);

  // Load messages
  useEffect(() => {
    if (!activeAccountId) return;
    setLoading(true);
    getMessagesForThread(activeAccountId, thread.id)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeAccountId, thread.id]);

  // Check per-sender allowlist (parallel queries, runs after messages load)
  useEffect(() => {
    if (!activeAccountId || messages.length === 0) return;
    let cancelled = false;

    const senders = new Set<string>();
    for (const msg of messages) {
      if (msg.from_address) senders.add(msg.from_address);
    }

    Promise.all(
      Array.from(senders).map(async (sender) => ({
        sender,
        isAllowed: await isAllowlisted(activeAccountId, sender),
      }))
    ).then((results) => {
      if (cancelled) return;
      const allowed = new Set<string>();
      for (const { sender, isAllowed } of results) {
        if (isAllowed) allowed.add(sender);
      }
      setAllowlistedSenders(allowed);
    });

    return () => { cancelled = true; };
  }, [activeAccountId, messages]);

  // Auto-mark unread threads as read when opened
  useEffect(() => {
    if (!activeAccountId || thread.isRead || markedReadRef.current === thread.id) return;
    markedReadRef.current = thread.id;
    updateThread(thread.id, { isRead: true });
    getGmailClient(activeAccountId).then((client) => {
      client.modifyThread(thread.id, undefined, ["UNREAD"]).catch((err) => {
        console.error("Failed to mark thread as read:", err);
      });
    });
  }, [activeAccountId, thread.id, thread.isRead, updateThread]);

  const openComposer = useComposerStore((s) => s.openComposer);
  const openMenu = useContextMenuStore((s) => s.openMenu);
  const lastMessage = messages[messages.length - 1];

  const handleReply = useCallback(() => {
    if (!lastMessage) return;
    const replyTo = lastMessage.reply_to ?? lastMessage.from_address;
    openComposer({
      mode: "reply",
      to: replyTo ? [replyTo] : [],
      subject: `Re: ${lastMessage.subject ?? ""}`,
      bodyHtml: buildQuote(lastMessage),
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  }, [lastMessage, openComposer]);

  const handleReplyAll = useCallback(() => {
    if (!lastMessage) return;
    const replyTo = lastMessage.reply_to ?? lastMessage.from_address;
    const allRecipients = new Set<string>();
    if (replyTo) allRecipients.add(replyTo);
    if (lastMessage.to_addresses) {
      lastMessage.to_addresses.split(",").forEach((a) => allRecipients.add(a.trim()));
    }
    const ccList: string[] = [];
    if (lastMessage.cc_addresses) {
      lastMessage.cc_addresses.split(",").forEach((a) => ccList.push(a.trim()));
    }
    openComposer({
      mode: "replyAll",
      to: Array.from(allRecipients),
      cc: ccList,
      subject: `Re: ${lastMessage.subject ?? ""}`,
      bodyHtml: buildQuote(lastMessage),
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  }, [lastMessage, openComposer]);

  const handleForward = useCallback(() => {
    if (!lastMessage) return;
    openComposer({
      mode: "forward",
      to: [],
      subject: `Fwd: ${lastMessage.subject ?? ""}`,
      bodyHtml: buildForwardQuote(lastMessage),
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  }, [lastMessage, openComposer]);

  const handlePrint = useCallback(() => {
    if (messages.length === 0) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }

    const messagesHtml = messages.map((msg) => {
      const date = new Date(msg.date).toLocaleString();
      const from = msg.from_name
        ? `${escapeHtml(msg.from_name)} &lt;${escapeHtml(msg.from_address ?? "")}&gt;`
        : escapeHtml(msg.from_address ?? "Unknown");
      const to = escapeHtml(msg.to_addresses ?? "");
      const body = msg.body_html ? sanitizeHtml(msg.body_html) : escapeHtml(msg.body_text ?? "");
      return `
        <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #e5e5e5">
          <div style="margin-bottom:8px;color:#666;font-size:12px">
            <strong>From:</strong> ${from}<br/>
            <strong>To:</strong> ${to}<br/>
            <strong>Date:</strong> ${date}
          </div>
          <div>${body}</div>
        </div>`;
    }).join("");

    const safeSubject = escapeHtml(thread.subject ?? "");
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>${safeSubject || "Email"}</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:800px;margin:20px auto;color:#333;font-size:14px}
      h1{font-size:18px;margin-bottom:8px}img{max-width:100%}</style></head>
      <body><h1>${safeSubject || "(No subject)"}</h1>${messagesHtml}</body></html>`);
    doc.close();

    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, [messages, thread.subject]);

  const handleMessageContextMenu = useCallback((e: React.MouseEvent, msg: DbMessage) => {
    e.preventDefault();
    openMenu("message", { x: e.clientX, y: e.clientY }, {
      messageId: msg.id,
      threadId: msg.thread_id,
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

      const emlParts = messages.map((msg) => {
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
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        Loading messages...
      </div>
    );
  }

  // Detect no-reply senders — disable reply buttons but still allow forward
  const noReply = isNoReplyAddress(lastMessage?.reply_to ?? lastMessage?.from_address);

  // Get the primary sender for the contact sidebar
  const primarySender = lastMessage?.from_address ?? null;
  const primarySenderName = lastMessage?.from_name ?? null;

  return (
    <div className="flex h-full @container relative">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Thread header */}
        <div className="px-6 py-4 border-b border-border-primary flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {thread.subject ?? "(No subject)"}
            </h1>
            <div className="text-xs text-text-tertiary mt-1">
              {messages.length} message{messages.length !== 1 ? "s" : ""} in this thread
            </div>
          </div>
          <div className="flex items-center gap-1">
            {lastMessage && (
              <>
                <button
                  onClick={handleReply}
                  disabled={noReply}
                  title={noReply ? "This sender does not accept replies" : "Reply (r)"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                >
                  <Reply size={14} />
                  Reply
                </button>
                <button
                  onClick={handleReplyAll}
                  disabled={noReply}
                  title={noReply ? "This sender does not accept replies" : "Reply All (a)"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                >
                  <ReplyAll size={14} />
                  Reply All
                </button>
                <button
                  onClick={handleForward}
                  title="Forward (f)"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
                >
                  <Forward size={14} />
                  Forward
                </button>
              </>
            )}
            <button
              onClick={handlePrint}
              title="Print"
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Printer size={16} />
            </button>
            <button
              onClick={handleExport}
              title="Export as .eml"
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => handlePopOut(thread)}
              title="Open in new window"
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <ExternalLink size={16} />
            </button>
            <button
              onClick={toggleContactSidebar}
              title={contactSidebarVisible ? "Hide contact sidebar" : "Show contact sidebar"}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              {contactSidebarVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </div>

        {/* Action bar */}
        <ActionBar thread={thread} messages={messages} />

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
          {messages.map((msg, i) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isLast={i === messages.length - 1}
              blockImages={blockImages}
              senderAllowlisted={msg.from_address ? allowlistedSenders.has(msg.from_address) : false}
              onContextMenu={(e) => handleMessageContextMenu(e, msg)}
            />
          ))}

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
    </div>
  );
}

function buildQuote(msg: DbMessage): string {
  const date = new Date(msg.date).toLocaleString();
  const from = msg.from_name
    ? `${escapeHtml(msg.from_name)} &lt;${escapeHtml(msg.from_address ?? "")}&gt;`
    : escapeHtml(msg.from_address ?? "Unknown");
  const body = msg.body_html ? sanitizeHtml(msg.body_html) : escapeHtml(msg.body_text ?? "");
  return `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666">On ${date}, ${from} wrote:<br>${body}</div>`;
}

function buildForwardQuote(msg: DbMessage): string {
  const date = new Date(msg.date).toLocaleString();
  const body = msg.body_html ? sanitizeHtml(msg.body_html) : escapeHtml(msg.body_text ?? "");
  return `<br><br>---------- Forwarded message ---------<br>From: ${escapeHtml(msg.from_name ?? "")} &lt;${escapeHtml(msg.from_address ?? "")}&gt;<br>Date: ${date}<br>Subject: ${escapeHtml(msg.subject ?? "")}<br>To: ${escapeHtml(msg.to_addresses ?? "")}<br><br>${body}`;
}
