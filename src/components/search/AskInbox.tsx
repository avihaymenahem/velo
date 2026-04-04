import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Sparkles, X, Send, ExternalLink } from "lucide-react";
import { askMyInbox, type AskInboxResult } from "@/services/ai/askInbox";
import { useAccountStore } from "@/stores/accountStore";
import { navigateToLabel } from "@/router/navigate";

interface AskInboxProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AskInbox({ isOpen, onClose }: AskInboxProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskInboxResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || !activeAccountId || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await askMyInbox(question.trim(), activeAccountId);
      setResult(res);
    } catch (err) {
      console.error("Ask inbox failed:", err);
      setResult({
        answer: "Sorry, something went wrong. Please check your AI configuration and try again.",
        sourceMessages: [],
      });
    } finally {
      setLoading(false);
    }
  }, [question, activeAccountId, loading]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAsk();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleAsk, onClose],
  );

  const handleNavigateToThread = useCallback((threadId: string) => {
    navigateToLabel("all", { threadId });
    onClose();
  }, [onClose]);

  const handleClear = useCallback(() => {
    setQuestion("");
    setResult(null);
    inputRef.current?.focus();
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh]">
      <div className="absolute inset-0 bg-black/30 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-lg overflow-hidden flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary bg-bg-secondary">
          <Sparkles size={16} className="text-accent" />
          <span className="text-sm font-medium text-text-primary flex-1">{t("search.askInbox")}</span>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-b border-border-secondary flex items-center gap-2">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("search.askPlaceholder")}
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <button
            onClick={handleAsk}
            disabled={!question.trim() || loading}
            className="p-1.5 text-accent hover:text-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-6 text-text-tertiary justify-center">
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <span className="text-sm">{t("search.searchingInbox")}</span>
            </div>
          )}

          {result && (
            <div className="p-4 space-y-4">
              {/* Answer */}
              <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {result.answer}
              </div>

              {/* Source messages */}
              {result.sourceMessages.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
                    {t("search.sources")} ({result.sourceMessages.length})
                  </div>
                  <div className="space-y-1.5">
                    {result.sourceMessages.slice(0, 5).map((msg) => (
                      <button
                        key={msg.message_id}
                        onClick={() => handleNavigateToThread(msg.thread_id)}
                        className="w-full text-left px-3 py-2 rounded-md bg-bg-secondary hover:bg-bg-hover transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-text-primary truncate">
                            {msg.from_name ?? msg.from_address ?? t("common.unknown")}
                          </span>
                          <span className="text-[0.625rem] text-text-tertiary shrink-0 ml-2">
                            {new Date(msg.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-xs text-text-secondary truncate mt-0.5 flex items-center gap-1">
                          {msg.subject ?? t("common.noSubject")}
                          <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask again */}
              <button
                onClick={handleClear}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                {t("search.askAnother")}
              </button>
            </div>
          )}

          {!loading && !result && (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              {t("search.askAnything")}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
