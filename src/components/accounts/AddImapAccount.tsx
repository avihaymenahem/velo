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
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { insertImapAccount } from "@/services/db/accounts";
import { useAccountStore } from "@/stores/accountStore";
import {
  discoverSettings,
  getDefaultImapPort,
  getDefaultSmtpPort,
  type SecurityType,
} from "@/services/imap/autoDiscovery";

interface AddImapAccountProps {
  onClose: () => void;
  onSuccess: () => void;
  onBack: () => void;
}

type Step = "basic" | "imap" | "smtp" | "test";

interface FormState {
  email: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityType;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityType;
  password: string;
  smtpPassword: string;
  samePassword: boolean;
}

const initialFormState: FormState = {
  email: "",
  displayName: "",
  imapHost: "",
  imapPort: 993,
  imapSecurity: "ssl",
  smtpHost: "",
  smtpPort: 465,
  smtpSecurity: "ssl",
  password: "",
  smtpPassword: "",
  samePassword: true,
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
    const settings = discoverSettings(form.email);
    if (settings && !form.imapHost && !form.smtpHost) {
      setForm((prev) => ({
        ...prev,
        imapHost: settings.imapHost,
        imapPort: settings.imapPort,
        imapSecurity: settings.imapSecurity,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpSecurity: settings.smtpSecurity,
      }));
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

  const canAdvanceFromBasic = form.email.trim().includes("@") && form.password.trim().length > 0;
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

  const testImapConnection = async () => {
    setImapTest({ state: "testing" });
    try {
      const result = await invoke<{ success: boolean; message: string }>(
        "imap_test_connection",
        {
          config: {
            host: form.imapHost,
            port: form.imapPort,
            security: form.imapSecurity,
            email: form.email,
            password: form.password,
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
      const smtpPassword = form.samePassword ? form.password : form.smtpPassword;
      const result = await invoke<{ success: boolean; message: string }>(
        "smtp_test_connection",
        {
          config: {
            host: form.smtpHost,
            port: form.smtpPort,
            security: form.smtpSecurity,
            email: form.email,
            password: smtpPassword,
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
      await insertImapAccount({
        id: accountId,
        email: form.email.trim(),
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
      });

      addAccount({
        id: accountId,
        email: form.email.trim(),
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
        />
      </div>
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
    </div>
  );

  const renderImapStep = () => (
    <div className="space-y-4">
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
      width="w-full max-w-md"
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
