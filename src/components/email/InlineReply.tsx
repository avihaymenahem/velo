import { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Reply, ReplyAll, Forward, Send, Maximize2 } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useComposerStore } from "@/stores/composerStore";
import { useUIStore } from "@/stores/uiStore";
import { sendEmail, archiveThread } from "@/services/emailActions";
import { buildRawEmail } from "@/utils/emailBuilder";
import { upsertContact } from "@/services/db/contacts";
import { getSetting } from "@/services/db/settings";
import { getDefaultSignature } from "@/services/db/signatures";
import type { DbMessage } from "@/services/db/messages";
import type { Thread } from "@/stores/threadStore";

type ReplyMode = "reply" | "replyAll" | "forward";

interface InlineReplyProps {
  thread: Thread;
  messages: DbMessage[];
  accountId: string;
  noReply?: boolean;
  onSent: () => void;
}

export function InlineReply({ thread, messages, accountId, noReply, onSent }: InlineReplyProps) {
  const [mode, setMode] = useState<ReplyMode | null>(null);
  const [sending, setSending] = useState(false);
  const [signatureHtml, setSignatureHtml] = useState("");
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.id === accountId);
  const openComposer = useComposerStore((s) => s.openComposer);
  const containerRef = useRef<HTMLDivElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastMessage = messages[messages.length - 1];

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false }),
      Underline,
      Placeholder.configure({
        placeholder: "Write your reply...",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 min-h-[80px] max-h-[200px] overflow-y-auto focus:outline-none text-text-primary text-sm",
      },
    },
  });

  const activateMode = useCallback((newMode: ReplyMode) => {
    setMode(newMode);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => editor?.commands.focus(), 50);
  }, [editor]);

  // Load default signature
  useEffect(() => {
    getDefaultSignature(accountId).then((sig) => {
      if (sig) setSignatureHtml(sig.body_html);
    });
  }, [accountId]);

  // Listen for inline reply events from keyboard shortcuts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: ReplyMode } | undefined;
      if (detail?.mode) {
        activateMode(detail.mode);
      }
    };
    window.addEventListener("velo-inline-reply", handler);
    return () => window.removeEventListener("velo-inline-reply", handler);
  }, [activateMode]);

  // Scroll into view when activated
  useEffect(() => {
    if (mode && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [mode]);

  const getRecipients = useCallback((): { to: string[]; cc: string[] } => {
    if (!lastMessage) return { to: [], cc: [] };

    if (mode === "forward") return { to: [], cc: [] };

    const replyTo = lastMessage.reply_to ?? lastMessage.from_address;

    if (mode === "reply") {
      return { to: replyTo ? [replyTo] : [], cc: [] };
    }

    // replyAll
    const allTo = new Set<string>();
    if (replyTo) allTo.add(replyTo);
    if (lastMessage.to_addresses) {
      lastMessage.to_addresses.split(",").forEach((a) => allTo.add(a.trim()));
    }
    // Remove self from recipients
    if (activeAccount?.email) allTo.delete(activeAccount.email);

    const ccList: string[] = [];
    if (lastMessage.cc_addresses) {
      lastMessage.cc_addresses.split(",").forEach((a) => {
        const trimmed = a.trim();
        if (trimmed && trimmed !== activeAccount?.email) ccList.push(trimmed);
      });
    }

    return { to: Array.from(allTo), cc: ccList };
  }, [lastMessage, mode, activeAccount?.email]);

  const getSubject = useCallback((): string => {
    const sub = lastMessage?.subject ?? "";
    if (mode === "forward") return sub.startsWith("Fwd:") ? sub : `Fwd: ${sub}`;
    return sub.startsWith("Re:") ? sub : `Re: ${sub}`;
  }, [lastMessage, mode]);

  const handleSend = useCallback(async () => {
    if (!activeAccount || !editor || sending) return;
    const { to, cc } = getRecipients();
    if (to.length === 0 && mode !== "forward") return;

    setSending(true);
    try {
      let html = editor.getHTML();
      if (signatureHtml) {
        html += `<div style="margin-top:16px;border-top:1px solid #e5e5e5;padding-top:12px">${signatureHtml}</div>`;
      }

      const raw = buildRawEmail({
        from: activeAccount.email,
        to,
        cc: cc.length > 0 ? cc : undefined,
        subject: getSubject(),
        htmlBody: html,
        inReplyTo: lastMessage?.id,
        threadId: thread.id,
      });

      // Get undo send delay
      const delaySetting = await getSetting("undo_send_delay_seconds");
      const delay = parseInt(delaySetting ?? "5", 10) * 1000;

      const { setUndoSendVisible, setUndoSendTimer } = useComposerStore.getState();
      setUndoSendVisible(true);

      const timer = setTimeout(async () => {
        try {
          await sendEmail(accountId, raw, thread.id);

          // Send & archive: remove from inbox if enabled
          if (useUIStore.getState().sendAndArchive) {
            try { await archiveThread(accountId, thread.id, []); } catch { /* ignore */ }
          }

          // Update contacts frequency
          for (const addr of [...to, ...cc]) {
            await upsertContact(addr, null);
          }
        } catch (err) {
          console.error("Failed to send inline reply:", err);
        } finally {
          setUndoSendVisible(false);
        }
      }, delay);

      setUndoSendTimer(timer);

      // Reset state
      editor.commands.setContent("");
      setMode(null);
      onSent();
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  }, [activeAccount, editor, sending, getRecipients, getSubject, signatureHtml, lastMessage, thread.id, accountId, mode, onSent]);

  const handleExpandToComposer = useCallback(() => {
    if (!editor || !lastMessage) return;
    const { to, cc } = getRecipients();
    const bodyHtml = editor.getHTML();

    openComposer({
      mode: mode === "forward" ? "forward" : mode === "replyAll" ? "replyAll" : "reply",
      to,
      cc,
      subject: getSubject(),
      bodyHtml,
      threadId: thread.id,
      inReplyToMessageId: lastMessage.id,
    });

    // Reset inline state
    editor.commands.setContent("");
    setMode(null);
  }, [editor, lastMessage, getRecipients, getSubject, mode, thread.id, openComposer]);

  // Cleanup focus timer on unmount
  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  // Handle Ctrl+Enter to send
  useEffect(() => {
    if (!mode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, handleSend]);

  if (!lastMessage) return null;

  // Collapsed state — show reply buttons
  if (!mode) {
    return (
      <div ref={containerRef} className="mx-4 my-3 flex items-center gap-2">
        <button
          onClick={() => activateMode("reply")}
          disabled={noReply}
          title={noReply ? "This sender does not accept replies" : undefined}
          className="flex items-center gap-1.5 px-4 py-2 text-xs text-text-secondary border border-border-primary rounded-lg hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary"
        >
          <Reply size={14} />
          Reply
        </button>
        <button
          onClick={() => activateMode("replyAll")}
          disabled={noReply}
          title={noReply ? "This sender does not accept replies" : undefined}
          className="flex items-center gap-1.5 px-4 py-2 text-xs text-text-secondary border border-border-primary rounded-lg hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary"
        >
          <ReplyAll size={14} />
          Reply All
        </button>
        <button
          onClick={() => activateMode("forward")}
          className="flex items-center gap-1.5 px-4 py-2 text-xs text-text-secondary border border-border-primary rounded-lg hover:bg-bg-hover hover:text-text-primary transition-colors"
        >
          <Forward size={14} />
          Forward
        </button>
      </div>
    );
  }

  // Expanded state — editor visible
  const { to } = getRecipients();
  const modeLabel = mode === "reply" ? "Reply" : mode === "replyAll" ? "Reply All" : "Forward";

  return (
    <div ref={containerRef} className="mx-4 my-3 border border-border-primary rounded-lg overflow-hidden bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border-secondary">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {(["reply", "replyAll", "forward"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[0.6875rem] rounded transition-colors ${
                  mode === m
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                {m === "reply" ? "Reply" : m === "replyAll" ? "Reply All" : "Forward"}
              </button>
            ))}
          </div>
          {to.length > 0 && (
            <span className="text-[0.6875rem] text-text-tertiary truncate max-w-[200px]">
              to {to.join(", ")}
            </span>
          )}
        </div>
        <button
          onClick={() => setMode(null)}
          className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border-secondary bg-bg-secondary">
        <button
          onClick={handleExpandToComposer}
          title="Expand to full composer"
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
        >
          <Maximize2 size={12} />
          Expand
        </button>
        <button
          onClick={handleSend}
          disabled={sending || (to.length === 0 && mode !== "forward")}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={12} />
          {modeLabel}
        </button>
      </div>
    </div>
  );
}
