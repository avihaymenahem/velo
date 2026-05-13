import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAccountStore } from "@/stores/accountStore";
import { checkBlacklists, getBlacklistHistory } from "@/services/deliverability/blacklistService";
import type { BlacklistCheckResult } from "@/services/deliverability/blacklistService";
import type { BlacklistCheckRow } from "@/services/db/blacklistCache";

export function BlacklistChecker() {
  const { t } = useTranslation();
  const accounts = useAccountStore((s) => s.accounts);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [target, setTarget] = useState("");
  const [checkType, setCheckType] = useState<"ip" | "domain">("ip");
  const [results, setResults] = useState<BlacklistCheckResult[] | null>(null);
  const [history, setHistory] = useState<BlacklistCheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!selectedAccountId) return;
    setHistoryLoading(true);
    try {
      const rows = await getBlacklistHistory(selectedAccountId);
      setHistory(rows);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedAccountId]);

  async function handleCheck() {
    if (!selectedAccountId || !target.trim()) return;
    setLoading(true);
    try {
      const res = await checkBlacklists(selectedAccountId, target.trim(), checkType);
      setResults(res);
      await loadHistory();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-text-tertiary">
          {t("settings.blacklist.description")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <select
          className="px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-sm"
          value={selectedAccountId}
          onChange={(e) => {
            setSelectedAccountId(e.target.value);
            setResults(null);
          }}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.email}</option>
          ))}
        </select>
        <select
          className="px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-sm"
          value={checkType}
          onChange={(e) => setCheckType(e.target.value as "ip" | "domain")}
        >
          <option value="ip">IP Address</option>
          <option value="domain">Domain</option>
        </select>
        <input
          type="text"
          className="flex-1 px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-sm"
          placeholder={checkType === "ip" ? "1.2.3.4" : "example.com"}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button
          onClick={handleCheck}
          disabled={loading || !target.trim()}
          className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? t("common.checking") : t("settings.blacklist.checkNow")}
        </button>
      </div>

      {results && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-text-primary">{t("settings.blacklist.results")}</h4>
          <div className="grid grid-cols-2 gap-2">
            {results.map((r) => (
              <div
                key={r.listName}
                className={`p-3 rounded-lg border ${
                  r.listed ? "border-danger bg-danger/10" : r.responded ? "border-success bg-success/10" : "border-border-primary bg-bg-secondary"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">{r.listName}</span>
                  <span className={`text-xs ${r.listed ? "text-danger" : r.responded ? "text-success" : "text-text-tertiary"}`}>
                    {r.listed ? "LISTED" : r.responded ? "Clean" : "No response"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-text-primary">{t("settings.blacklist.history")}</h4>
          <button
            onClick={loadHistory}
            className="text-xs text-accent hover:underline"
          >
            {t("common.refresh")}
          </button>
        </div>
        {historyLoading && <p className="text-sm text-text-tertiary">Loading...</p>}
        {!historyLoading && history.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("settings.blacklist.noHistory")}</p>
        )}
        {!historyLoading && history.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {history.slice(0, 20).map((h) => (
              <div key={h.id} className="flex items-center justify-between py-1 px-2 bg-bg-secondary rounded text-xs">
                <span className="text-text-primary">{h.target}</span>
                <span className={h.listed ? "text-danger" : "text-success"}>
                  {h.list_name} — {h.listed ? "Listed" : "Clean"}
                </span>
                <span className="text-text-tertiary">
                  {new Date(h.checked_at * 1000).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
