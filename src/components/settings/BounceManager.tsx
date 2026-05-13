import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAccountStore } from "@/stores/accountStore";
import { getBounceReport } from "@/services/deliverability/bounceService";
import { getSuppressionList, removeFromSuppression } from "@/services/deliverability/suppressionList";
import type { BounceReport } from "@/services/deliverability/bounceService";
import type { SuppressionEntry } from "@/services/deliverability/suppressionList";

export function BounceManager() {
  const { t } = useTranslation();
  const accounts = useAccountStore((s) => s.accounts);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [report, setReport] = useState<BounceReport | null>(null);
  const [suppressions, setSuppressions] = useState<SuppressionEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0]!.id);
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    loadData();
  }, [selectedAccountId]);

  async function loadData() {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        getBounceReport(selectedAccountId),
        getSuppressionList(selectedAccountId),
      ]);
      setReport(r);
      setSuppressions(s);
    } finally {
      setLoading(false);
    }
  }

  async function handleRelease(email: string) {
    await removeFromSuppression(selectedAccountId, email);
    const updated = await getSuppressionList(selectedAccountId);
    setSuppressions(updated);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-text-tertiary">
          {t("settings.bounce.description")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <select
          className="px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-sm"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.email}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-text-tertiary">Loading...</p>}

      {!loading && report && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-primary">
            <div className="text-2xl font-bold text-text-primary">{report.totalBounces}</div>
            <div className="text-xs text-text-tertiary">{t("settings.bounce.total")}</div>
          </div>
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-primary">
            <div className="text-2xl font-bold text-danger">{report.hardBounces}</div>
            <div className="text-xs text-text-tertiary">{t("settings.bounce.hard")}</div>
          </div>
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-primary">
            <div className="text-2xl font-bold text-warning">{report.softBounces}</div>
            <div className="text-xs text-text-tertiary">{t("settings.bounce.soft")}</div>
          </div>
          <div className="p-3 bg-bg-secondary rounded-lg border border-border-primary">
            <div className="text-2xl font-bold text-text-primary">{report.policyBounces}</div>
            <div className="text-xs text-text-tertiary">{t("settings.bounce.policy")}</div>
          </div>
        </div>
      )}

      {!loading && report && report.topReasons.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-text-primary mb-2">{t("settings.bounce.topReasons")}</h4>
          <div className="space-y-1">
            {report.topReasons.slice(0, 5).map((r, i) => (
              <div key={i} className="flex justify-between py-1 px-2 bg-bg-secondary rounded text-xs">
                <span className="text-text-primary">{r.reason}</span>
                <span className="text-text-secondary">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">
          {t("settings.suppression.title")} ({suppressions.length})
        </h4>
        {suppressions.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("settings.suppression.empty")}</p>
        )}
        {suppressions.length > 0 && (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {suppressions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-lg">
                <div>
                  <div className="text-sm text-text-primary">{s.email}</div>
                  <div className="text-xs text-text-tertiary">{s.reason}</div>
                </div>
                <button
                  onClick={() => handleRelease(s.email)}
                  className="text-xs text-accent hover:underline"
                >
                  {t("settings.suppression.release")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
