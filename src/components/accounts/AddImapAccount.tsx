import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  Mail,
  Send,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { insertImapAccount, insertOAuthImapAccount } from "@/services/db/accounts";
import { useAccountStore } from "@/stores/accountStore";
import {
  discoverSettings,
  getDefaultImapPort,
  getDefaultSmtpPort,
  type SecurityType,
} from "@/services/imap/autoDiscovery";
import { getOAuthProvider } from "@/services/oauth/providers";
import { startProviderOAuthFlow } from "@/services/oauth/oauthFlow";

interface AddImapAccountProps {
  onClose: () => void;
  onSuccess: () => void;
  onBack: () => void;
}

type Step = "basic" | "imap" | "smtp" | "test";
type AuthMode = "password" | "oauth2";

interface FormState {
  email: string;
  displayName: string;
  imapUsername: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityType;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityType;
  password: string;
  smtpPassword: string;
  samePassword: boolean;
  // OAuth2 fields
  authMode: AuthMode;
  oauthProvider: string | null;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  oauthExpiresAt: number | null;
  oauthEmail: string | null;
}

const initialFormState: FormState = {
  email: "",
  displayName: "",
  imapUsername: "",
  imapHost: "",
  imapPort: 993,
  imapSecurity: "ssl",
  smtpHost: "",
  smtpPort: 465,
  smtpSecurity: "ssl",
  password: "",
  smtpPassword: "",
  samePassword: true,
  authMode: "password",
  oauthProvider: null,
  oauthClientId: "",
  oauthClientSecret: "",
  oauthAccessToken: null,
  oauthRefreshToken: null,
  oauthExpiresAt: null,
  oauthEmail: null,
};

const steps: Step[] = ["basic", "imap", "smtp", "test"];

const stepLabels: Record<Step, string> = {
  basic: "Account",
  imap: "Incoming",
  smtp: "Outgoing",
  test: "Verify",
};

const stepIcons: Record<Step, React.ReactNode> = {
  basic: <Mail className="w-4 h-4" />,
  imap: <Server className="w-4 h-4" />,
  smtp: <Send className="w-4 h-4" />,
  test: <ShieldCheck className="w-4 h-4" />,
};

interface TestStatus {
  state: "idle" | "testing" | "success" | "error";
  message?: string;
}

const inputClass =
  "w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors";
const labelClass = "block text-xs font-medium text-text-secondary mb-1";
const selectClass =
  "w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors appearance-none";

/** Map UI security value ("ssl") to Rust config value ("tls") */
function mapSecurity(security: string): string {
  if (security === "ssl") return "tls";
  return security;
}

export function AddImapAccount({
  onClose,
  onSuccess,
  onBack,
}: AddImapAccountProps) {
  const [currentStep, setCurrentStep] = useState<Step>("basic");
  const [form, setForm] = useState<FormState>(initialFormState);
  const [imapTest, setImapTest] = useState<TestStatus>({ state: "idle" });
  const [smtpTest, setSmtpTest] = useState<TestStatus>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discoveryApplied, setDiscoveryApplied] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [detectedAuthMethods, setDetectedAuthMethods] = useState<AuthMode[]>(["password"]);
  const [detectedOAuthProviderId, setDetectedOAuthProviderId] = useState<string | null>(null);

  const addAccount = useAccountStore((s) => s.addAccount);

  const currentStepIndex = steps.indexOf(currentStep);

  const updateForm = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleEmailBlur = useCallback(() => {
    if (discoveryApplied) return;
    const result = discoverSettings(form.email);
    if (result && !form.imapHost && !form.smtpHost) {
      setForm((prev) => ({
        ...prev,
        imapHost: result.settings.imapHost,
        imapPort: result.settings.imapPort,
        imapSecurity: result.settings.imapSecurity,
        smtpHost: result.settings.smtpHost,
        smtpPort: result.settings.smtpPort,
        smtpSecurity: result.settings.smtpSecurity,
        // Auto-select OAuth2 if it's the only option (e.g. Outlook)
        authMode: result.authMethods[0] === "oauth2" ? "oauth2" : prev.authMode,
        oauthProvider: result.oauthProviderId ?? null,
      }));
      setDetectedAuthMethods(result.authMethods);
      setDetectedOAuthProviderId(result.oauthProviderId ?? null);
      setDiscoveryApplied(true);
    }
  }, [form.email, form.imapHost, form.smtpHost, discoveryApplied]);

  const handleImapSecurityChange = useCallback(
    (security: SecurityType) => {
      setForm((prev) => ({
        ...prev,
        imapSecurity: security,
        imapPort: getDefaultImapPort(security),
      }));
    },
    [],
  );

  const handleSmtpSecurityChange = useCallback(
    (security: SecurityType) => {
      setForm((prev) => ({
        ...prev,
        smtpSecurity: security,
        smtpPort: getDefaultSmtpPort(security),
      }));
    },
    [],
  );

  const isOAuth = form.authMode === "oauth2";
  const hasOAuthTokens = !!(form.oauthAccessToken && form.oauthRefreshToken);

  const canAdvanceFromBasic =
    form.email.trim().includes("@") &&
    (isOAuth ? hasOAuthTokens : form.password.trim().length > 0);
  const canAdvanceFromImap = form.imapHost.trim().length > 0 && form.imapPort > 0;
  const canAdvanceFromSmtp = form.smtpHost.trim().length > 0 && form.smtpPort > 0;
  const bothTestsPassed = imapTest.state === "success" && smtpTest.state === "success";

  const goNext = useCallback(() => {
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1]!);
    }
  }, [currentStep]);

  const goPrev = useCallback(() => {
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1]!);
    } else {
      onBack();
    }
  }, [currentStep, onBack]);

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case "basic":
        return canAdvanceFromBasic;
      case "imap":
        return canAdvanceFromImap;
      case "smtp":
        return canAdvanceFromSmtp;
      case "test":
        return false;
      default:
        return false;
    }
  };

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && currentStep !== "test" && canGoNext()) {
        e.preventDefault();
        goNext();
      }
    },
    [currentStep, goNext, canGoNext],
  );

  const handleOAuthConnect = async (providerId: string) => {
    const provider = getOAuthProvider(providerId);
    if (!provider) {
      setOauthError(`Unknown provider: ${providerId}`);
      return;
    }

    if (!form.oauthClientId.trim()) {
      setOauthError("Please enter a Client ID first.");
      return;
    }

    setOauthConnecting(true);
    setOauthError(null);

    try {
      const { tokens, userInfo } = await startProviderOAuthFlow(
        provider,
        form.oauthClientId.trim(),
        form.oauthClientSecret.trim() || undefined,
      );

      const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

      setForm((prev) => ({
        ...prev,
        oauthAccessToken: tokens.access_token,
        oauthRefreshToken: tokens.refresh_token ?? null,
        oauthExpiresAt: expiresAt,
        oauthEmail: userInfo.email,
        email: userInfo.email || prev.email,
        displayName: userInfo.name || prev.displayName,
        oauthProvider: providerId,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOauthError(message);
    } finally {
      setOauthConnecting(false);
    }
  };

  const testImapConnection = async () => {
    setImapTest({ state: "testing" });
    try {
      const result = await invoke<{ success: boolean; message: string }>(
        "imap_test_connection",
        {
          config: {
            host: form.imapHost,
            port: form.imapPort,
            security: mapSecurity(form.imapSecurity),
            username: form.imapUsername || (isOAuth ? (form.oauthEmail ?? form.email) : form.email),
            password: isOAuth ? (form.oauthAccessToken ?? "") : form.password,
            auth_method: isOAuth ? "oauth2" : "password",
          },
        },
      );
      setImapTest({
        state: result.success ? "success" : "error",
        message: result.message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImapTest({ state: "error", message });
    }
  };

  const testSmtpConnection = async () => {
    setSmtpTest({ state: "testing" });
    try {
      const smtpPassword = isOAuth
        ? (form.oauthAccessToken ?? "")
        : form.samePassword
          ? form.password
          : form.smtpPassword;
      const result = await invoke<{ success: boolean; message: string }>(
        "smtp_test_connection",
        {
          config: {
            host: form.smtpHost,
            port: form.smtpPort,
            security: mapSecurity(form.smtpSecurity),
            username: form.imapUsername || (isOAuth ? (form.oauthEmail ?? form.email) : form.email),
            password: smtpPassword,
            auth_method: isOAuth ? "oauth2" : "password",
          },
        },
      );
      setSmtpTest({
        state: result.success ? "success" : "error",
        message: result.message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSmtpTest({ state: "error", message });
    }
  };

  const testBothConnections = async () => {
    await Promise.all([testImapConnection(), testSmtpConnection()]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const accountId = crypto.randomUUID();
      const email = (isOAuth ? form.oauthEmail : null) ?? form.email.trim();

      const imapUsername = form.imapUsername.trim() || null;

      if (isOAuth) {
        await insertOAuthImapAccount({
          id: accountId,
          email,
          displayName: form.displayName.trim() || null,
          avatarUrl: null,
          imapHost: form.imapHost.trim(),
          imapPort: form.imapPort,
          imapSecurity: form.imapSecurity,
          smtpHost: form.smtpHost.trim(),
          smtpPort: form.smtpPort,
          smtpSecurity: form.smtpSecurity,
          accessToken: form.oauthAccessToken!,
          refreshToken: form.oauthRefreshToken!,
          tokenExpiresAt: form.oauthExpiresAt!,
          oauthProvider: form.oauthProvider!,
          oauthClientId: form.oauthClientId.trim(),
          oauthClientSecret: form.oauthClientSecret.trim() || null,
          imapUsername,
        });
      } else {
        await insertImapAccount({
          id: accountId,
          email,
          displayName: form.displayName.trim() || null,
          avatarUrl: null,
          imapHost: form.imapHost.trim(),
          imapPort: form.imapPort,
          imapSecurity: form.imapSecurity,
          smtpHost: form.smtpHost.trim(),
          smtpPort: form.smtpPort,
          smtpSecurity: form.smtpSecurity,
          authMethod: "password",
          password: form.samePassword ? form.password : form.password,
          imapUsername,
        });
      }

      addAccount({
        id: accountId,
        email,
        displayName: form.displayName.trim() || null,
        avatarUrl: null,
        isActive: true,
      });

      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      setSaving(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 mb-6">
      {steps.map((step, i) => {
        const isActive = i === currentStepIndex;
        const isCompleted = i < currentStepIndex;
        return (
          <div key={step} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`w-6 h-px ${isCompleted ? "bg-accent" : "bg-border-primary"}`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : isCompleted
                    ? "text-accent"
                    : "text-text-tertiary"
              }`}
            >
              {stepIcons[step]}
              <span className="hidden sm:inline">{stepLabels[step]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderAuthModeSelector = () => {
    const showOAuth = detectedAuthMethods.includes("oauth2") || form.authMode === "oauth2";
    if (!showOAuth) return null;

    return (
      <div className="mb-4">
        <label className={labelClass}>Authentication Method</label>
        <div className="flex gap-2">
          {detectedAuthMethods.includes("password") && (
            <button
              type="button"
              onClick={() => updateForm("authMode", "password")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                form.authMode === "password"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border-primary bg-bg-secondary text-text-secondary hover:bg-bg-hover"
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Password
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              updateForm("authMode", "oauth2");
              if (detectedOAuthProviderId) {
                updateForm("oauthProvider", detectedOAuthProviderId);
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
              form.authMode === "oauth2"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-primary bg-bg-secondary text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            OAuth2
          </button>
        </div>
      </div>
    );
  };

  const renderOAuthSection = () => {
    const providerId = form.oauthProvider ?? detectedOAuthProviderId;
    const providerName = providerId === "microsoft" ? "Microsoft" : providerId === "yahoo" ? "Yahoo" : "Provider";

    return (
      <div className="space-y-3">
        <div>
          <label htmlFor="oauth-client-id" className={labelClass}>
            Client ID
          </label>
          <input
            id="oauth-client-id"
            type="text"
            value={form.oauthClientId}
            onChange={(e) => updateForm("oauthClientId", e.target.value)}
            placeholder={`${providerName} app Client ID`}
            className={inputClass}
            disabled={hasOAuthTokens}
          />
        </div>
        <div>
          <label htmlFor="oauth-client-secret" className={labelClass}>
            Client Secret (optional)
          </label>
          <input
            id="oauth-client-secret"
            type="password"
            value={form.oauthClientSecret}
            onChange={(e) => updateForm("oauthClientSecret", e.target.value)}
            placeholder="Leave blank for public clients"
            className={inputClass}
            disabled={hasOAuthTokens}
          />
        </div>

        {hasOAuthTokens ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            <div className="text-sm text-success">
              Connected as <span className="font-medium">{form.oauthEmail}</span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => providerId && handleOAuthConnect(providerId)}
            disabled={oauthConnecting || !form.oauthClientId.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {oauthConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Sign in with {providerName}
              </>
            )}
          </button>
        )}

        {oauthError && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-sm text-danger">
            {oauthError}
          </div>
        )}

        <p className="text-xs text-text-tertiary">
          You need to register an app with {providerName} to get a Client ID.{" "}
          {providerId === "microsoft" && (
            <>Register at the Azure Portal (App Registrations) with redirect URI <code className="text-accent">http://127.0.0.1:17248</code>.</>
          )}
          {providerId === "yahoo" && (
            <>Register at the Yahoo Developer Network with redirect URI <code className="text-accent">http://127.0.0.1:17248</code>.</>
          )}
        </p>
      </div>
    );
  };

  const renderBasicStep = () => (
    <div className="space-y-4">
      <div>
        <label htmlFor="imap-email" className={labelClass}>
          Email Address
        </label>
        <input
          id="imap-email"
          type="email"
          value={form.email}
          onChange={(e) => updateForm("email", e.target.value)}
          onBlur={handleEmailBlur}
          placeholder="you@example.com"
          className={inputClass}
          autoFocus
          disabled={isOAuth && hasOAuthTokens}
        />
      </div>

      {renderAuthModeSelector()}

      {isOAuth ? (
        renderOAuthSection()
      ) : (
        <>
          <div>
            <label htmlFor="imap-display-name" className={labelClass}>
              Display Name (optional)
            </label>
            <input
              id="imap-display-name"
              type="text"
              value={form.displayName}
              onChange={(e) => updateForm("displayName", e.target.value)}
              placeholder="Your Name"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="imap-username" className={labelClass}>
              Username (optional)
            </label>
            <input
              id="imap-username"
              type="text"
              value={form.imapUsername}
              onChange={(e) => updateForm("imapUsername", e.target.value)}
              placeholder="Leave blank to use your email address"
              className={inputClass}
            />
            <p className="text-xs text-text-tertiary mt-1">
              Only needed if your login username differs from your email address.
            </p>
          </div>
          <div>
            <label htmlFor="imap-password" className={labelClass}>
              Password
            </label>
            <input
              id="imap-password"
              type="password"
              value={form.password}
              onChange={(e) => updateForm("password", e.target.value)}
              placeholder="Enter your email password or app password"
              className={inputClass}
            />
            <p className="text-xs text-text-tertiary mt-1">
              If your provider requires it, use an app-specific password.
            </p>
          </div>
        </>
      )}

      {isOAuth && hasOAuthTokens && (
        <div>
          <label htmlFor="imap-display-name" className={labelClass}>
            Display Name (optional)
          </label>
          <input
            id="imap-display-name"
            type="text"
            value={form.displayName}
            onChange={(e) => updateForm("displayName", e.target.value)}
            placeholder="Your Name"
            className={inputClass}
          />
        </div>
      )}
    </div>
  );

  const renderImapStep = () => (
    <div className="space-y-4">
      {isOAuth && (
        <p className="text-xs text-text-tertiary">
          Server settings have been auto-configured for your provider. You can adjust them if needed.
        </p>
      )}
      <div>
        <label htmlFor="imap-host" className={labelClass}>
          IMAP Server
        </label>
        <input
          id="imap-host"
          type="text"
          value={form.imapHost}
          onChange={(e) => updateForm("imapHost", e.target.value)}
          placeholder="imap.example.com"
          className={inputClass}
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="imap-port" className={labelClass}>
            Port
          </label>
          <input
            id="imap-port"
            type="number"
            value={form.imapPort}
            onChange={(e) =>
              updateForm("imapPort", parseInt(e.target.value, 10) || 0)
            }
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="imap-security" className={labelClass}>
            Security
          </label>
          <select
            id="imap-security"
            value={form.imapSecurity}
            onChange={(e) =>
              handleImapSecurityChange(e.target.value as SecurityType)
            }
            className={selectClass}
          >
            <option value="ssl">SSL/TLS</option>
            <option value="starttls">STARTTLS</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderSmtpStep = () => (
    <div className="space-y-4">
      {isOAuth && (
        <p className="text-xs text-text-tertiary">
          Server settings have been auto-configured for your provider. You can adjust them if needed.
        </p>
      )}
      <div>
        <label htmlFor="smtp-host" className={labelClass}>
          SMTP Server
        </label>
        <input
          id="smtp-host"
          type="text"
          value={form.smtpHost}
          onChange={(e) => updateForm("smtpHost", e.target.value)}
          placeholder="smtp.example.com"
          className={inputClass}
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="smtp-port" className={labelClass}>
            Port
          </label>
          <input
            id="smtp-port"
            type="number"
            value={form.smtpPort}
            onChange={(e) =>
              updateForm("smtpPort", parseInt(e.target.value, 10) || 0)
            }
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="smtp-security" className={labelClass}>
            Security
          </label>
          <select
            id="smtp-security"
            value={form.smtpSecurity}
            onChange={(e) =>
              handleSmtpSecurityChange(e.target.value as SecurityType)
            }
            className={selectClass}
          >
            <option value="ssl">SSL/TLS</option>
            <option value="starttls">STARTTLS</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>
      {!isOAuth && (
        <>
          <div className="flex items-center gap-2">
            <input
              id="smtp-same-password"
              type="checkbox"
              checked={form.samePassword}
              onChange={(e) => updateForm("samePassword", e.target.checked)}
              className="rounded border-border-primary text-accent focus:ring-accent"
            />
            <label
              htmlFor="smtp-same-password"
              className="text-sm text-text-secondary"
            >
              Use same password as IMAP
            </label>
          </div>
          {!form.samePassword && (
            <div>
              <label htmlFor="smtp-password" className={labelClass}>
                SMTP Password
              </label>
              <input
                id="smtp-password"
                type="password"
                value={form.smtpPassword}
                onChange={(e) => updateForm("smtpPassword", e.target.value)}
                placeholder="SMTP password"
                className={inputClass}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderTestResult = (label: string, status: TestStatus) => {
    const icon =
      status.state === "testing" ? (
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
      ) : status.state === "success" ? (
        <CheckCircle2 className="w-4 h-4 text-success" />
      ) : status.state === "error" ? (
        <XCircle className="w-4 h-4 text-danger" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-border-primary" />
      );

    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-bg-secondary border border-border-primary">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">{label}</div>
          {status.message && (
            <div
              className={`text-xs mt-0.5 ${
                status.state === "error"
                  ? "text-danger"
                  : status.state === "success"
                    ? "text-success"
                    : "text-text-tertiary"
              }`}
            >
              {status.message}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTestStep = () => (
    <div className="space-y-4">
      <div className="text-sm text-text-secondary mb-2">
        Test your connection settings before adding the account.
      </div>

      <div className="space-y-3">
        {renderTestResult("IMAP Connection", imapTest)}
        {renderTestResult("SMTP Connection", smtpTest)}
      </div>

      <button
        onClick={testBothConnections}
        disabled={imapTest.state === "testing" || smtpTest.state === "testing"}
        className="w-full px-4 py-2 text-sm bg-bg-secondary border border-border-primary rounded-lg text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {imapTest.state === "testing" || smtpTest.state === "testing"
          ? "Testing..."
          : imapTest.state === "idle" && smtpTest.state === "idle"
            ? "Test Connection"
            : "Re-test Connection"}
      </button>

      {saveError && (
        <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-sm text-danger">
          {saveError}
        </div>
      )}
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case "basic":
        return renderBasicStep();
      case "imap":
        return renderImapStep();
      case "smtp":
        return renderSmtpStep();
      case "test":
        return renderTestStep();
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Add IMAP/SMTP Account"
      width="w-full max-w-lg"
    >
      <div className="p-4" onKeyDown={handleKeyDown}>
        {renderStepIndicator()}
        {renderStepContent()}

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={goPrev}
            className="flex items-center gap-1 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>

            {currentStep === "test" ? (
              <button
                onClick={handleSave}
                disabled={!bothTestsPassed || saving}
                className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Adding..." : "Add Account"}
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
                className="flex items-center gap-1 px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
