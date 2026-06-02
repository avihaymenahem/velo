import { useTranslation } from "react-i18next";

export function AppLoadingScreen() {
  const { t } = useTranslation("common");

  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
        <span className="text-xs text-text-tertiary animate-pulse">
          {t("appLoading.inbox")}
        </span>
      </div>
    </div>
  );
}
