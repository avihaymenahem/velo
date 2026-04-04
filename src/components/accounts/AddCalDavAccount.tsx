import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/TextField";
import { insertCalDavAccount } from "@/services/db/accounts";
import { useAccountStore } from "@/stores/accountStore";
import { discoverCalDavSettings, testCalDavConnection } from "@/services/calendar/autoDiscovery";

interface AddCalDavAccountProps {
  onClose: () => void;
  onSuccess: () => void;
  onBack: () => void;
}

type Step = "basic" | "server" | "test" | "done";

export function AddCalDavAccount({ onClose, onSuccess, onBack }: AddCalDavAccountProps) {
  const { t } = useTranslation();
  const addAccount = useAccountStore((s) => s.addAccount);
  const [step, setStep] = useState<Step>("basic");

  // Form state
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [caldavUrl, setCaldavUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [providerName, setProviderName] = useState<string | null>(null);
  const [needsAppPassword, setNeedsAppPassword] = useState(false);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [calendarCount, setCalendarCount] = useState(0);

  // Creating account
  const [creating, setCreating] = useState(false);

  const handleDiscoverAndNext = useCallback(async () => {
    if (!email.trim()) return;
    setUsername(email);

    const result = await discoverCalDavSettings(email);
    if (result.caldavUrl) {
      setCaldavUrl(result.caldavUrl);
    }
    setProviderName(result.providerName);
    setNeedsAppPassword(result.needsAppPassword);
    setStep("server");
  }, [email]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);

    const result = await testCalDavConnection(caldavUrl, username, password);
    setTestResult(result);
    setCalendarCount(result.calendarCount ?? 0);
    setTesting(false);
  }, [caldavUrl, username, password]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      await insertCalDavAccount({
        id,
        email,
        displayName: displayName || null,
        caldavUrl,
        caldavUsername: username,
        caldavPassword: password,
      });

      addAccount({
        id,
        email,
        displayName: displayName || null,
        avatarUrl: null,
        isActive: true,
      });

      setStep("done");
    } catch (err) {
      console.error("Failed to create CalDAV account:", err);
      setTestResult({ success: false, message: t("addCalDav.failedToSave") });
    } finally {
      setCreating(false);
    }
  }, [email, displayName, caldavUrl, username, password, addAccount, t]);

  return (
    <Modal isOpen={true} onClose={onClose} title={t("addCalDav.title")} width="w-full max-w-md">
      <div className="p-4">
        {step === "basic" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <Calendar size={20} className="text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-primary">{t("addCalDav.accountTitle")}</h3>
                <p className="text-xs text-text-tertiary">
                  {t("addCalDav.accountDescription")}
                </p>
              </div>
            </div>

            <TextField
              label={t("addCalDav.email")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
            />

            <TextField
              label={t("addCalDav.displayName")}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("addCalDav.displayNamePlaceholder")}
            />

            <div className="flex justify-between pt-2">
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                {t("common.back")}
              </button>
              <button
                onClick={handleDiscoverAndNext}
                disabled={!email.trim()}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
              >
                {t("addCalDav.next")}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === "server" && (
          <div className="space-y-4">
            {providerName && (
              <div className="text-xs text-accent font-medium">
                {t("addCalDav.detected", { provider: providerName })}
              </div>
            )}

            {needsAppPassword && (
              <div className="p-3 bg-warning/10 border border-warning/30 rounded text-xs text-text-secondary">
                {t("addCalDav.appPasswordRequired")}
              </div>
            )}

            <TextField
              label={t("addCalDav.serverUrl")}
              type="url"
              value={caldavUrl}
              onChange={(e) => setCaldavUrl(e.target.value)}
              placeholder="https://caldav.example.com/"
            />

            <TextField
              label={t("addCalDav.username")}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your@email.com"
            />

            <TextField
              label={needsAppPassword ? t("addCalDav.appPassword") : t("addCalDav.password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={needsAppPassword ? t("addCalDav.appPasswordPlaceholder") : t("addCalDav.password")}
            />

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep("basic")}
                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                {t("common.back")}
              </button>
              <button
                onClick={() => { setStep("test"); handleTest(); }}
                disabled={!caldavUrl || !password}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
              >
                {t("addCalDav.testAndConnect")}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === "test" && (
          <div className="space-y-4">
            <div className="text-center py-6">
              {testing && (
                <>
                  <Loader2 size={32} className="animate-spin text-accent mx-auto mb-3" />
                  <p className="text-sm text-text-secondary">{t("addCalDav.testingConnection")}</p>
                </>
              )}

              {!testing && testResult?.success && (
                <>
                  <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-primary">{testResult.message}</p>
                  {calendarCount > 0 && (
                    <p className="text-xs text-text-tertiary mt-1">
                      {t("addCalDav.foundCalendars", { count: calendarCount })}
                    </p>
                  )}
                </>
              )}

              {!testing && testResult && !testResult.success && (
                <>
                  <XCircle size={32} className="text-danger mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-primary">{t("addCalDav.connectionFailed")}</p>
                  <p className="text-xs text-text-tertiary mt-1">{testResult.message}</p>
                </>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => { setStep("server"); setTestResult(null); }}
                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                {t("common.back")}
              </button>

              {testResult?.success ? (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
                >
                  {creating ? t("addCalDav.creating") : t("addCalDav.addAccount")}
                </button>
              ) : !testing ? (
                <button
                  onClick={handleTest}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
                >
                  {t("common.retry")}
                </button>
              ) : null}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6">
            <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
            <p className="text-sm font-medium text-text-primary">{t("addCalDav.accountAdded")}</p>
            <p className="text-xs text-text-tertiary mt-1">
              {t("addCalDav.calendarsWillSync")}
            </p>
            <button
              onClick={onSuccess}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
            >
              {t("common.done")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
