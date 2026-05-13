import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, TrendingUp, Clock, CheckCircle, XCircle } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { getFilterDashboard, type FilterDashboard } from "@/services/filters/filterMonitor";

export function FilterDashboard() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [dashboard, setDashboard] = useState<FilterDashboard | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const data = await getFilterDashboard(activeAccountId);
      setDashboard(data);
    } catch (err) {
      console.error("Failed to load filter dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !dashboard) {
    return (
      <div className="text-xs text-text-tertiary py-4 text-center">
        Loading dashboard...
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-xs text-text-tertiary py-4 text-center">
        No filter data available.
      </div>
    );
  }

  const formatPct = (v: number) => `${(v * 100).toFixed(0)}%`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Filter Dashboard</h3>
        <button
          onClick={loadDashboard}
          className="px-2 py-1 text-xs text-accent hover:text-accent-hover rounded"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-bg-secondary rounded-lg p-3 border border-border-primary">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-1">
            <Clock size={12} />
            <span>Match rate (24h)</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className={dashboard.matchRate24h > 0.5 ? "text-success" : "text-text-tertiary"} />
            <span className="text-lg font-semibold text-text-primary">{formatPct(dashboard.matchRate24h)}</span>
          </div>
        </div>
        <div className="bg-bg-secondary rounded-lg p-3 border border-border-primary">
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-1">
            <Clock size={12} />
            <span>Match rate (7d)</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className={dashboard.matchRate7d > 0.5 ? "text-success" : "text-text-tertiary"} />
            <span className="text-lg font-semibold text-text-primary">{formatPct(dashboard.matchRate7d)}</span>
          </div>
        </div>
      </div>

      {dashboard.topRules.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-1.5">Top 10 most-matched rules</h4>
          <div className="space-y-1">
            {dashboard.topRules.map((rule, idx) => (
              <div
                key={rule.ruleId}
                className="flex items-center justify-between px-2.5 py-1.5 bg-bg-secondary rounded text-xs"
              >
                <span className="text-text-primary truncate flex-1">
                  <span className="text-text-tertiary mr-1">{idx + 1}.</span>
                  {rule.ruleName}
                </span>
                <span className="text-accent font-medium ml-2">{rule.matchCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dashboard.zeroMatchRules.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-1.5 flex items-center gap-1">
            <AlertTriangle size={12} className="text-warning" />
            Rules with 0 matches
          </h4>
          <div className="space-y-1">
            {dashboard.zeroMatchRules.map((rule) => (
              <div
                key={rule.ruleId}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-secondary rounded text-xs"
              >
                <AlertTriangle size={11} className="text-warning shrink-0" />
                <span className="text-text-primary">{rule.ruleName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dashboard.recentLogs.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-secondary mb-1.5">Recent match log</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {dashboard.recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-bg-secondary rounded text-xs"
              >
                {log.matched === 1 ? (
                  <CheckCircle size={11} className="text-success shrink-0" />
                ) : (
                  <XCircle size={11} className="text-text-tertiary shrink-0" />
                )}
                <span className="text-text-primary flex-1 truncate">{log.ruleName}</span>
                {log.score > 0 && (
                  <span className="text-text-tertiary">score: {log.score}</span>
                )}
                <span className="text-text-tertiary text-[0.625rem]">
                  {new Date(log.created_at * 1000).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
