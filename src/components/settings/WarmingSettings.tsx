import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAccountStore } from "@/stores/accountStore";
import { getWarmingPlan, enableWarming, disableWarming, getWarmingProgress } from "@/services/deliverability/warmingService";
import type { WarmingPlan, WarmingProgress } from "@/services/deliverability/warmingService";

export function WarmingSettings() {
  const { t } = useTranslation();
  const accounts = useAccountStore((s) => s.accounts);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [plan, setPlan] = useState<WarmingPlan | null>(null);
  const [progress, setProgress] = useState<WarmingProgress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0]!.id);
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    loadPlan();
  }, [selectedAccountId]);

  async function loadPlan() {
    setLoading(true);
    try {
      const [p, pr] = await Promise.all([
        getWarmingPlan(selectedAccountId),
        getWarmingProgress(selectedAccountId),
      ]);
      setPlan(p);
      setProgress(pr);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    if (!selectedAccountId) return;
    if (plan?.enabled) {
      await disableWarming(selectedAccountId);
    } else {
      await enableWarming(selectedAccountId);
    }
    await loadPlan();
  }

  const currentPlan = plan;
  const currentProgress = progress;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-text-tertiary">
          {t("settings.warming.description")}
        </p>
      </div>

      {accounts.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("settings.noAccounts")}</p>
      )}

      {accounts.length > 0 && (
        <>
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

          {!loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-primary">{t("settings.warming.enabled")}</span>
                <button
                  onClick={handleToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    currentPlan?.enabled ? "bg-accent" : "bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      currentPlan?.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {currentPlan?.enabled && currentProgress && (
                <>
                  <div>
                    <span className="text-sm text-text-secondary">
                      {t("settings.warming.progress")}: {currentProgress.currentVolume} / {currentProgress.targetVolume}
                    </span>
                    <div className="mt-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${currentProgress.percentageComplete}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-sm text-text-secondary">
                    {t("settings.warming.day")} {currentProgress.day} / {currentProgress.totalDays}
                  </div>

                  <div>
                    <span className="text-sm text-text-secondary">{t("settings.warming.volumeRamp")}</span>
                    <div className="mt-2 flex items-end gap-1 h-16">
                      {Array.from({ length: currentProgress.totalDays }, (_, i) => {
                        const dayPct = Math.min(100, ((i + 1) / currentProgress.totalDays) * 100);
                        const vol = Math.round(currentProgress.startVolume + (currentProgress.targetVolume - currentProgress.startVolume) * (dayPct / 100));
                        const isCurrent = i + 1 === currentProgress.day;
                        return (
                          <div
                            key={i}
                            className={`flex-1 rounded-t transition-all ${isCurrent ? "bg-accent" : "bg-bg-tertiary"}`}
                            style={{ height: `${(vol / currentProgress.targetVolume) * 100}%` }}
                            title={`Day ${i + 1}: ${vol}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {!currentPlan?.enabled && (
                <p className="text-sm text-text-tertiary">{t("settings.warming.notEnabled")}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
