import { useState } from "react";
import { setSetting, setSecureSetting } from "@/services/db/settings";
import { Modal } from "@/components/ui/Modal";
import { t } from "@/i18n";

interface SetupClientIdProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function SetupClientId({ onComplete, onCancel }: SetupClientIdProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmedId = clientId.trim();
    const trimmedSecret = clientSecret.trim();
    if (!trimmedId || !trimmedSecret) return;

    setSaving(true);
    try {
      await setSetting("google_client_id", trimmedId);
      await setSecureSetting("google_client_secret", trimmedSecret);
      onComplete();
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={t("accounts.setupClientId.title")} width="w-full max-w-lg">
      <div className="p-4">
        <p className="text-text-secondary text-sm mb-4">
          {t("accounts.setupClientId.desc")}
        </p>

        <ol className="text-text-secondary text-sm mb-4 space-y-1 list-decimal list-inside">
          <li>
            {t("accounts.setupClientId.step1")}
          </li>
          <li>{t("accounts.setupClientId.step2")}</li>
          <li>{t("accounts.setupClientId.step3")}</li>
          <li>
            {t("accounts.setupClientId.step4")}
          </li>
          <li>
            {t("accounts.setupClientId.step5", { uri: "http://127.0.0.1:17248" })}
          </li>
          <li>{t("accounts.setupClientId.step6")}</li>
        </ol>

        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder={t("accounts.setupClientId.clientIdPlaceholder")}
          className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm mb-3 outline-none focus:border-accent"
        />

        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={t("accounts.setupClientId.clientSecretPlaceholder")}
          className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm mb-1 outline-none focus:border-accent"
        />
        <p className="text-text-tertiary text-xs mb-4">
          {t("accounts.setupClientId.clientSecretHint")}
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={!clientId.trim() || !clientSecret.trim() || saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t("common.saving") : t("accounts.setupClientId.saveAndContinue")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
