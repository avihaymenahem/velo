import { useState, useCallback } from "react";
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
      setTestResult({ success: false, message: "Failed to save account" });
    } finally {
      setCreating(false);
    }
  }, [email, displayName, caldavUrl, username, password, addAccount]);

  return (
    <Modal isOpen={true} onClose={onClose} title="Add CalDAV Calendar" width="w-full max-w-md">
      <div className="p-4">
        {step === "basic" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <Calendar size={20} className="text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-primary">CalDAV Calendar Account</h3>
                <p className="text-xs text-text-tertiary">
                  Connect to iCloud, Fastmail, Nextcloud, or any CalDAV server
                </p>
              </div>
            </div>

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
            />

            <TextField
              label="Display Name (optional)"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Calendar"
            />

            <div className="flex justify-between pt-2">
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                onClick={handleDiscoverAndNext}
                disabled={!email.trim()}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
              >
                Next
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === "server" && (
          <div className="space-y-4">
            {providerName && (
              <div className="text-xs text-accent font-medium">
                Detected: {providerName}
              </div>
            )}

            {needsAppPassword && (
              <div className="p-3 bg-warning/10 border border-warning/30 rounded text-xs text-text-secondary">
                This provider requires an app-specific password. Generate one in your provider's security settings.
              </div>
            )}

            <TextField
              label="CalDAV Server URL"
              type="url"
              value={caldavUrl}
              onChange={(e) => setCaldavUrl(e.target.value)}
              placeholder="https://caldav.example.com/"
            />

            <TextField
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your@email.com"
            />

            <TextField
              label={needsAppPassword ? "App Password" : "Password"}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={needsAppPassword ? "App-specific password" : "Password"}
            />

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep("basic")}
                className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                onClick={() => { setStep("test"); handleTest(); }}
                disabled={!caldavUrl || !password}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
              >
                Test & Connect
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
                  <p className="text-sm text-text-secondary">Testing connection...</p>
                </>
              )}

              {!testing && testResult?.success && (
                <>
                  <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-primary">{testResult.message}</p>
                  {calendarCount > 0 && (
                    <p className="text-xs text-text-tertiary mt-1">
                      Found {calendarCount} calendar{calendarCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </>
              )}

              {!testing && testResult && !testResult.success && (
                <>
                  <XCircle size={32} className="text-danger mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-primary">Connection failed</p>
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
                Back
              </button>

              {testResult?.success ? (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Add Account"}
                </button>
              ) : !testing ? (
                <button
                  onClick={handleTest}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6">
            <CheckCircle2 size={32} className="text-success mx-auto mb-3" />
            <p className="text-sm font-medium text-text-primary">CalDAV account added!</p>
            <p className="text-xs text-text-tertiary mt-1">
              Your calendars will sync automatically.
            </p>
            <button
              onClick={onSuccess}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
