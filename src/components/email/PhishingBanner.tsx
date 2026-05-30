import { ShieldAlert } from "lucide-react";
import { t } from "@/i18n";
import type { MessageScanResult } from "@/utils/phishingDetector";

interface PhishingBannerProps {
  scanResult: MessageScanResult;
  onTrustSender: () => void;
}

export function PhishingBanner({ scanResult, onTrustSender }: PhishingBannerProps) {
  const isHigh = scanResult.maxRiskScore >= 60;

  const bgClass = isHigh
    ? "bg-danger/10 border-danger/30"
    : "bg-warning/10 border-warning/30";
  const textClass = isHigh ? "text-danger" : "text-warning";
  const iconClass = isHigh ? "text-danger" : "text-warning";
  const buttonClass = isHigh
    ? "text-danger hover:text-danger/80 border-danger/30 hover:bg-danger/5"
    : "text-warning hover:text-warning/80 border-warning/30 hover:bg-warning/5";

  return (
    <div className={`mx-4 my-2 px-3 py-2.5 rounded-lg border ${bgClass} flex items-center gap-3`}>
      <ShieldAlert size={18} className={`shrink-0 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${textClass}`}>
          {isHigh ? t("email.phishing.highRisk") : t("email.phishing.suspicious")} {t("email.phishing.linksDetected")}
        </p>
        <p className="text-xs text-text-tertiary mt-0.5">
          {scanResult.suspiciousLinkCount === 1
            ? t("email.phishing.oneLink")
            : t("email.phishing.multipleLinks", { count: scanResult.suspiciousLinkCount })}
          {" "}{t("email.phishing.cautionMessage")}
        </p>
      </div>
      <button
        onClick={onTrustSender}
        className={`shrink-0 text-xs px-2.5 py-1 rounded-md border transition-colors ${buttonClass}`}
      >
        {t("email.phishing.trustSender")}
      </button>
    </div>
  );
}
