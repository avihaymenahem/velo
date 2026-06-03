import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { isAiAvailable } from "@/services/ai/providerManager";
import { generateThreadBriefing, type ThreadBriefing } from "@/services/ai/aiService";
import { deleteAiCache } from "@/services/db/aiCache";
import type { DbMessage } from "@/services/db/messages";
import { useTranslation } from "react-i18next";

interface ThreadSummaryProps {
  threadId: string;
  accountId: string;
  messages: DbMessage[];
}

export function ThreadSummary({ threadId, accountId, messages }: ThreadSummaryProps) {
  const { t } = useTranslation("email");
  const [briefing, setBriefing] = useState<ThreadBriefing | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [available, setAvailable] = useState(false);
  const checkedRef = useRef(false);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    loadingRef.current = false;
    checkedRef.current = false;
    setAvailable(false);
    setBriefing(null);
    setError(false);
    setLoading(false);
  }, [threadId, accountId]);

  useEffect(() => {
    if (messages.length < 2) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    isAiAvailable().then(setAvailable);
  }, [messages.length, threadId, accountId]);

  const loadSummary = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(false);
    try {
      const result = await generateThreadBriefing(threadId, accountId, messages);
      if (requestId !== requestIdRef.current) return;
      setBriefing(result);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to generate thread briefing:", err);
      setBriefing(null);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [threadId, accountId, messages]);

  // Auto-load summary when available
  useEffect(() => {
    if (!available || messages.length < 2 || briefing !== null || error || loadingRef.current) return;
    loadSummary();
  }, [available, messages.length, briefing, error, loadSummary]);

  const handleRefresh = useCallback(async () => {
    await deleteAiCache(accountId, threadId, "briefing");
    setBriefing(null);
    setError(false);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await generateThreadBriefing(threadId, accountId, messages);
      if (requestId !== requestIdRef.current) return;
      setBriefing(result);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to refresh thread briefing:", err);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
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
        <span className="text-xs font-medium text-accent flex-1">{t("ai.briefing.title")}</span>
        {(briefing || error) && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); handleRefresh(); } }}
            className="p-0.5 text-text-tertiary hover:text-accent transition-colors cursor-pointer"
            title={t("ai.briefing.refresh")}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </span>
        )}
        {collapsed ? <ChevronDown size={14} className="text-text-tertiary" /> : <ChevronUp size={14} className="text-text-tertiary" />}
      </button>
      {!collapsed && (
        <div className="mt-2 text-sm text-text-secondary">
          {loading && !briefing && (
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <span className="text-xs">{t("ai.briefing.generating")}</span>
            </div>
          )}
          {error && !loading && (
            <div className="text-xs text-text-tertiary">
              <div className="font-medium text-text-secondary">{t("ai.briefing.unavailable")}</div>
              <div className="mt-1">{t("ai.briefing.unavailableHint")}</div>
            </div>
          )}
          {briefing && !loading && (
            <div className="space-y-2 text-xs leading-relaxed">
              <BriefingSection label={t("ai.briefing.sections.summary")} value={briefing.summary} />
              <BriefingSection label={t("ai.briefing.sections.latestRequest")} value={briefing.latestRequest} />
              <BriefingSection label={t("ai.briefing.sections.suggestedAction")} value={briefing.suggestedAction} />
              <BriefingSection label={t("ai.briefing.sections.riskOrDueSignal")} value={briefing.riskOrDueSignal} />
              <BriefingSection label={t("ai.briefing.sections.source")} value={briefing.source} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BriefingSection({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div>
      <div className="font-medium text-text-primary">{label}</div>
      <div className="mt-0.5 text-text-secondary">{value}</div>
    </div>
  );
}
