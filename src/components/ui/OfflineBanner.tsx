import { useUIStore } from "@/stores/uiStore";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export function OfflineBanner() {
  const isOnline = useUIStore((s) => s.isOnline);
  const { t } = useTranslation("email");

  if (isOnline) return null;

  return (
    <div className="fixed top-8 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-warning/90 text-white text-xs px-4 py-1.5 backdrop-blur-sm">
      <WifiOff size={14} />
      <span>{t("offline.banner")}</span>
    </div>
  );
}
