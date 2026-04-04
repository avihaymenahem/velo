import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Copy, Check } from "lucide-react";
import { setSetting, setSecureSetting } from "@/services/db/settings";
import { Modal } from "@/components/ui/Modal";

const GMAIL_API_URL = "https://console.cloud.google.com/apis/library/gmail.googleapis.com";
const OAUTH_CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials/oauthclient";
const REDIRECT_URI = "http://127.0.0.1:17248";

interface SetupClientIdProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function SetupClientId({ onComplete, onCancel }: SetupClientIdProps) {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const handleCopyUri = async () => {
    await navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={t("setupClientId.title")} width="w-full max-w-lg">
      <div className="p-4 space-y-5">
        <p className="text-text-secondary text-sm">
          {t("setupClientId.description")}
        </p>

        {/* Step 1 */}
        <div className="rounded-lg border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1">{t("setupClientId.step1Title")}</h3>
          <p className="text-xs text-text-tertiary mb-3">{t("setupClientId.step1Description")}</p>
          <button
            onClick={() => openUrl(GMAIL_API_URL)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
          >
            <ExternalLink size={14} />
            {t("setupClientId.step1Button")}
          </button>
        </div>

        {/* Step 2 */}
        <div className="rounded-lg border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1">{t("setupClientId.step2Title")}</h3>
          <p className="text-xs text-text-tertiary mb-3">{t("setupClientId.step2Description")}</p>
          <button
            onClick={() => openUrl(OAUTH_CREDENTIALS_URL)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors mb-3"
          >
            <ExternalLink size={14} />
            {t("setupClientId.step2Button")}
          </button>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-text-tertiary">{t("setupClientId.step2RedirectUri")}</span>
            <code className="bg-bg-tertiary px-2 py-0.5 rounded text-xs">{REDIRECT_URI}</code>
            <button
              onClick={handleCopyUri}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t("setupClientId.step2Copied") : t("setupClientId.step2CopyUri")}
            </button>
          </div>
        </div>

        {/* Step 3 */}
        <div className="rounded-lg border border-border-primary p-4">
          <h3 className="text-sm font-medium text-text-primary mb-1">{t("setupClientId.step3Title")}</h3>
          <p className="text-xs text-text-tertiary mb-3">{t("setupClientId.step3Description")}</p>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t("setupClientId.clientIdPlaceholder")}
            className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm mb-3 outline-none focus:border-accent"
          />
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={t("setupClientId.clientSecretPlaceholder")}
            className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm mb-1 outline-none focus:border-accent"
          />
          <p className="text-text-tertiary text-xs">
            {t("setupClientId.clientSecretNote")}
          </p>
        </div>

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
            {saving ? t("common.saving") : t("setupClientId.saveAndContinue")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
