import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from "lucide-react";
import type { AuthResult } from "@/services/gmail/authParser";

interface AuthBadgeProps {
  authResults: string | null;
}

export function AuthBadge({ authResults }: AuthBadgeProps) {
  const { t } = useTranslation("email");
  const [showTooltip, setShowTooltip] = useState(false);

  if (!authResults) return null;

  let parsed: AuthResult;
  try {
    parsed = JSON.parse(authResults) as AuthResult;
  } catch {
    return null;
  }

  const { aggregate, spf, dkim, dmarc } = parsed;

  const formatResult = (result: string) => t(`authBadge.results.${result}`, { defaultValue: result });
  const tooltipLines = [
    t("authBadge.detailLine", { protocol: "SPF", result: formatResult(spf.result), detail: spf.detail ? ` (${spf.detail})` : "" }),
    t("authBadge.detailLine", { protocol: "DKIM", result: formatResult(dkim.result), detail: dkim.detail ? ` (${dkim.detail})` : "" }),
    t("authBadge.detailLine", { protocol: "DMARC", result: formatResult(dmarc.result), detail: dmarc.detail ? ` (${dmarc.detail})` : "" }),
  ].join("\n");

  const iconProps = { size: 14, className: "shrink-0" };

  let icon: React.ReactNode;
  let colorClass: string;
  let label: string;

  switch (aggregate) {
    case "pass":
      icon = <ShieldCheck {...iconProps} />;
      colorClass = "text-success";
      label = t("authBadge.labels.pass");
      break;
    case "warning":
      icon = <ShieldAlert {...iconProps} />;
      colorClass = "text-warning";
      label = t("authBadge.labels.warning");
      break;
    case "fail":
      icon = <ShieldX {...iconProps} />;
      colorClass = "text-danger";
      label = t("authBadge.labels.fail");
      break;
    default:
      icon = <ShieldQuestion {...iconProps} />;
      colorClass = "text-text-tertiary";
      label = t("authBadge.labels.unknown");
      break;
  }

  return (
    <span
      className={`relative inline-flex items-center ${colorClass}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      aria-label={label}
      role="img"
    >
      {icon}
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1.5 text-xs rounded-md bg-bg-tertiary text-text-primary border border-border-secondary shadow-md whitespace-pre z-50 pointer-events-none">
          {tooltipLines}
        </span>
      )}
    </span>
  );
}
