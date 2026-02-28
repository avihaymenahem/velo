import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/uiStore";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const { t } = useTranslation();
  const isOnline = useUIStore((s) => s.isOnline);

  if (isOnline) return null;

  return (
    <div className="fixed top-8 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-warning/90 text-white text-xs px-4 py-1.5 backdrop-blur-sm">
      <WifiOff size={14} />
      <span>{t("offline")}</span>
    </div>
  );
}
