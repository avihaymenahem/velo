import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { isAiAvailable } from "@/services/ai/providerManager";
import { generateSmartReplies } from "@/services/ai/aiService";
import { deleteAiCache } from "@/services/db/aiCache";
import { useComposerStore } from "@/stores/composerStore";
import type { DbMessage } from "@/services/db/messages";

interface SmartReplySuggestionsProps {
  threadId: string;
  accountId: string;
  messages: DbMessage[];
  noReply?: boolean;
}

export function SmartReplySuggestions({ threadId, accountId, messages, noReply }: SmartReplySuggestionsProps) {
  const [replies, setReplies] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(false);
  const checkedRef = useRef(false);
  const loadingRef = useRef(false);
  const openComposer = useComposerStore((s) => s.openComposer);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    isAiAvailable().then(setAvailable);
  }, []);

  const loadReplies = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await generateSmartReplies(threadId, accountId, messages);
      setReplies(result);
    } catch (err) {
      console.error("Failed to generate smart replies:", err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [threadId, accountId, messages]);

  // Auto-load when available
  useEffect(() => {
    if (!available || messages.length === 0 || replies !== null || loadingRef.current) return;
    loadReplies();
  }, [available, messages.length, replies, loadReplies]);

  const handleRefresh = useCallback(async () => {
    await deleteAiCache(accountId, threadId, "smart_replies");
    setReplies(null);
    setLoading(true);
    try {
      const result = await generateSmartReplies(threadId, accountId, messages);
      setReplies(result);
    } catch (err) {
      console.error("Failed to refresh smart replies:", err);
    } finally {
      setLoading(false);
    }
  }, [threadId, accountId, messages]);

  const handleReplyClick = useCallback((replyText: string) => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    const replyTo = lastMessage.reply_to ?? lastMessage.from_address;
    openComposer({
      mode: "reply",
      to: replyTo ? [replyTo] : [],
      subject: `Re: ${lastMessage.subject ?? ""}`,
      bodyHtml: `<p>${replyText}</p>`,
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  }, [messages, openComposer]);

  if (!available || messages.length === 0 || noReply) return null;

  return (
    <div className="mx-4 my-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-accent shrink-0" />
        <span className="text-xs font-medium text-accent flex-1">Quick Replies</span>
        <button
          onClick={handleRefresh}
          className="p-0.5 text-text-tertiary hover:text-accent transition-colors"
          title="Refresh suggestions"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {loading && !replies && (
        <div className="flex items-center gap-2 text-text-tertiary">
          <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-xs">Generating suggestions...</span>
        </div>
      )}
      {replies && (
        <div className="flex flex-wrap gap-2">
          {replies.map((reply, i) => (
            <button
              key={i}
              onClick={() => handleReplyClick(reply)}
              className="px-3 py-1.5 text-xs text-text-primary bg-bg-primary border border-border-primary rounded-full hover:bg-bg-hover hover:border-accent/40 transition-colors max-w-[280px] truncate"
              title={reply}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
