import { useState, useEffect, useRef } from "react";
import { CSSTransition } from "react-transition-group";
import { Sparkles } from "lucide-react";
import {
  isQuestionQuery,
  getSearchAnswer,
  type SearchAnswerResult,
  type Citation,
} from "@/services/ai/searchAnswer";
import { openUrl } from "@tauri-apps/plugin-opener";

interface AnswerPanelProps {
   query: string;
   accountId: string | null;
   onCitationClick: (threadId: string, messageId?: string) => void;
 }

function getThreadIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('threadId') || u.pathname.match(/\/thread\/([^\/]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

function CitationChip({
  citation,
  onClick,
}: {
  citation: Citation;
  onClick: () => void;
}) {
  const shortLabel =
    citation.label.length > 28
      ? citation.label.slice(0, 28) + "…"
      : citation.label;
  return (
    <button
      onClick={onClick}
      title={citation.label}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.6rem] font-medium rounded bg-accent/15 text-accent hover:bg-accent/25 transition-colors align-baseline mx-0.5 leading-none"
    >
      <Sparkles size={8} className="shrink-0" />
      {shortLabel}
    </button>
  );
}

function renderTextWithLinks(
  text: string,
  onLinkClick: (href: string) => void,
): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={i}
          href={part}
          onClick={(e) => {
            e.preventDefault();
            onLinkClick(part);
          }}
          className="text-accent hover:underline"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderAnswer(
   answer: string,
   citations: Citation[],
   onCitationClick: (threadId: string, messageId?: string) => void,
 ): React.ReactNode[] {
  const citationMap = new Map(citations.map((c) => [c.id, c]));
  return answer.split(/(\[[^\]]+\])/).map((part, i) => {
    if (part.startsWith("[") && part.endsWith("]")) {
      const id = part.slice(1, -1);
      const citation = citationMap.get(id);
      if (citation) {
        return (
          <CitationChip
            key={i}
            citation={citation}
            onClick={() => onCitationClick(citation.threadId, citation.messageId)}
          />
        );
      }
    }
    return renderTextWithLinks(part, (href) => {
      const threadId = getThreadIdFromUrl(href);
      if (threadId) {
        onCitationClick(threadId);
      } else {
        openUrl(href).catch(() => {});
      }
    });
  });
}

export function AnswerPanel({
  query,
  accountId,
  onCitationClick,
}: AnswerPanelProps) {
  const [result, setResult] = useState<SearchAnswerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isActive = isQuestionQuery(query) && !!accountId;

  useEffect(() => {
    if (!isActive) {
      setResult(null);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      setResult(null);
      try {
        const r = await getSearchAnswer(query, accountId!);
        if (!ctrl.signal.aborted) setResult(r);
      } catch {
        // Silently dismiss — don't block the search results
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, accountId, isActive]);

  const show = isActive && (loading || result !== null);

  return (
    <CSSTransition
      nodeRef={panelRef}
      in={show}
      timeout={200}
      classNames="answer-panel"
      unmountOnExit
    >
      <div ref={panelRef} className="mx-4 my-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-accent" />
          <span className="text-xs font-medium text-accent flex-1">AI Answer</span>
        </div>

        {loading && !result && (
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-bg-hover animate-pulse w-full" />
            <div className="h-2 rounded-full bg-bg-hover animate-pulse w-4/5" />
            <div className="h-2 rounded-full bg-bg-hover animate-pulse w-3/5" />
          </div>
        )}

        {result && (
          <>
            <p className="text-xs text-text-primary leading-relaxed">
              {renderAnswer(result.answer, result.citations, onCitationClick)}
            </p>
            {result.citations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-accent/10">
                <span className="text-[0.65rem] font-semibold text-accent uppercase tracking-wider mb-2 block">
                  Sources
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {result.citations.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onCitationClick(c.threadId, c.messageId)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 text-[0.65rem] rounded-md bg-accent/5 text-text-secondary hover:bg-accent/15 hover:text-accent transition-all border border-transparent hover:border-accent/20"
                    >
                      <Sparkles size={10} className="shrink-0" />
                      <span className="truncate max-w-[200px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </CSSTransition>
  );
}