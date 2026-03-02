import { useTranslation } from "react-i18next";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { LinkAnalysis } from "@/utils/phishingDetector";

interface LinkConfirmDialogProps {
  linkAnalysis: LinkAnalysis;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LinkConfirmDialog({ linkAnalysis, onCancel, onConfirm }: LinkConfirmDialogProps) {
  const { t } = useTranslation("email");
  const isHigh = linkAnalysis.riskLevel === "high";
  const borderColor = isHigh ? "border-danger/40" : "border-warning/40";
  const headerBg = isHigh ? "bg-danger/10" : "bg-warning/10";
  const headerText = isHigh ? "text-danger" : "text-warning";

  const customHeader = (
    <div className={`px-4 py-3 ${headerBg} flex items-center gap-2.5 rounded-t-lg`}>
      <ShieldAlert size={18} className={headerText} />
      <h2 className={`text-sm font-semibold ${headerText}`}>
        {isHigh ? t("linkConfirm.highRiskLink") : t("linkConfirm.suspiciousLink")}
      </h2>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title=""
      width="w-full max-w-md mx-4"
      zIndex="z-[200]"
      panelClassName={`${borderColor} rounded-xl shadow-xl overflow-hidden`}
      renderHeader={customHeader}
    >
      {/* Content */}
      <div className="px-4 py-3 space-y-3">
        {/* URL display */}
        <div>
          <label className="text-xs text-text-tertiary block mb-1">{t("linkConfirm.fullUrl")}</label>
          <div className="flex items-start gap-2 p-2 bg-bg-tertiary rounded-md">
            <ExternalLink size={14} className="text-text-tertiary shrink-0 mt-0.5" />
            <span className="text-xs text-text-primary break-all font-mono leading-relaxed">
              {linkAnalysis.url}
            </span>
          </div>
        </div>

        {/* Display text if different */}
        {linkAnalysis.displayText && (
          <div>
            <label className="text-xs text-text-tertiary block mb-1">{t("linkConfirm.linkText")}</label>
            <p className="text-xs text-text-secondary px-2">
              {linkAnalysis.displayText}
            </p>
          </div>
        )}

        {/* Triggered rules */}
        {linkAnalysis.triggeredRules.length > 0 && (
          <div>
            <label className="text-xs text-text-tertiary block mb-1.5">
              {t("linkConfirm.issuesDetected", { count: linkAnalysis.triggeredRules.length })}
            </label>
            <ul className="space-y-1.5">
              {linkAnalysis.triggeredRules.map((rule) => (
                <li
                  key={rule.ruleId}
                  className="flex items-start gap-2 text-xs px-2"
                >
                  <span
                    className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                      rule.score >= 50
                        ? "bg-danger"
                        : rule.score >= 30
                          ? "bg-warning"
                          : "bg-yellow-400"
                    }`}
                  />
                  <div>
                    <span className="font-medium text-text-primary">
                      {rule.name}
                    </span>
                    <span className="text-text-tertiary ml-1">
                      {t("linkConfirm.points", { score: rule.score })}
                    </span>
                    <p className="text-text-tertiary mt-0.5">{rule.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border-primary flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hover transition-colors"
        >
          {t("linkConfirm.goBack")}
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 text-xs text-text-secondary bg-bg-tertiary border border-border-primary rounded-md hover:bg-bg-hover transition-colors"
        >
          {t("linkConfirm.openAnyway")}
        </button>
      </div>
    </Modal>
  );
}
