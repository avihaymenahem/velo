import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { isAiAvailable } from "@/services/ai/providerManager";
import { summarizeThread } from "@/services/ai/aiService";
import { deleteAiCache } from "@/services/db/aiCache";
import type { DbMessage } from "@/services/db/messages";

interface ThreadSummaryProps {
  threadId: string;
  accountId: string;
  messages: DbMessage[];
}

export function ThreadSummary({ threadId, accountId, messages }: ThreadSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [available, setAvailable] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    if (messages.length < 2) return;
    isAiAvailable().then(setAvailable);
  }, [messages.length]);

  const loadingRef = useRef(false);
  const loadSummary = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await summarizeThread(threadId, accountId, messages);
      setSummary(result);
    } catch (err) {
      console.error("Failed to summarize thread:", err);
      setSummary(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [threadId, accountId, messages]);

  // Auto-load summary when available
  useEffect(() => {
    if (!available || messages.length < 2 || summary !== null || loadingRef.current) return;
    loadSummary();
  }, [available, messages.length, summary, loadSummary]);

  const handleRefresh = useCallback(async () => {
    await deleteAiCache(accountId, threadId, "summary");
    setSummary(null);
    setLoading(true);
    try {
      const result = await summarizeThread(threadId, accountId, messages);
      setSummary(result);
    } catch (err) {
      console.error("Failed to refresh summary:", err);
    } finally {
      setLoading(false);
    }
  }, [threadId, accountId, messages]);

  if (!available || messages.length < 2) return null;

  return (
    <div className="mx-4 my-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Sparkles size={14} className="text-accent shrink-0" />
        <span className="text-xs font-medium text-accent flex-1">AI Summary</span>
        {summary && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); handleRefresh(); } }}
            className="p-0.5 text-text-tertiary hover:text-accent transition-colors cursor-pointer"
            title="Refresh summary"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </span>
        )}
        {collapsed ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronUp size={14} className="text-text-tertiary" />}
      </button>
      {!collapsed && (
        <div className="mt-2 text-sm text-text-secondary">
          {loading && !summary && (
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <span className="text-xs">Generating summary...</span>
            </div>
          )}
          {summary && <p className="text-xs leading-relaxed">{summary}</p>}
        </div>
      )}
    </div>
  );
}
