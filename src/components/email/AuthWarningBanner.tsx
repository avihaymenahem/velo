import { useTranslation } from "react-i18next";
import { ShieldX, X } from "lucide-react";
import type { AuthResult } from "@/services/gmail/authParser";

interface AuthWarningBannerProps {
  authResults: string | null;
  senderAddress: string | null;
  onDismiss: () => void;
}

export function AuthWarningBanner({ authResults, senderAddress, onDismiss }: AuthWarningBannerProps) {
  const { t } = useTranslation("email");

  if (!authResults) return null;

  let parsed: AuthResult;
  try {
    parsed = JSON.parse(authResults) as AuthResult;
  } catch {
    return null;
  }

  if (parsed.aggregate !== "fail") return null;

  const sender = senderAddress ?? t("authWarningBanner.thisSender");

  return (
    <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-3 flex items-start gap-2">
      <ShieldX size={16} className="text-danger shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-danger font-medium">
          {t("authWarningBanner.title")}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">
          {t("authWarningBanner.message", { sender })}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-danger/10 text-text-tertiary hover:text-text-secondary transition-colors"
        aria-label={t("authWarningBanner.dismiss")}
      >
        <X size={14} />
      </button>
    </div>
  );
}
