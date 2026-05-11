import { useTranslation } from "react-i18next";

export function PgpKeyManager() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-text-tertiary">{t("pgp.pageDescription")}</p>
      </div>
      <p className="text-sm text-text-tertiary">{t("pgp.noKeys")}</p>
    </div>
  );
}
