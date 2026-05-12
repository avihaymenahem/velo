import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getAccount } from "@/services/db/accounts";
import { updateImapAccount } from "@/services/db/accounts";
import { getDefaultImapPort, getDefaultSmtpPort, type SecurityType } from "@/services/imap/autoDiscovery";

interface EditImapAccountProps {
  accountId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  displayName: string;
  imapUsername: string;
  password: string;
  smtpPassword: string;
  smtpSameAsImap: boolean;
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityType;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityType;
  acceptInvalidCerts: boolean;
}

type TestStatus = { state: "idle" | "testing" | "success" | "error"; message?: string };

const inputClass =
  "w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors";
const labelClass = "block text-xs font-medium text-text-secondary mb-1";
const selectClass =
  "w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent transition-colors appearance-none";

function mapSecurity(security: string): string {
  if (security === "ssl") return "tls";
  return security;
}

export function EditImapAccount({ accountId, onClose, onSaved }: EditImapAccountProps) {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [authMethod, setAuthMethod] = useState("password");
  const [form, setForm] = useState<FormState>({
    displayName: "",
    imapUsername: "",
    password: "",
    smtpPassword: "",
    smtpSameAsImap: true,
    imapHost: "",
    imapPort: 993,
    imapSecurity: "ssl",
    smtpHost: "",
    smtpPort: 465,
    smtpSecurity: "ssl",
    acceptInvalidCerts: false,
  });
  const [imapTest, setImapTest] = useState<TestStatus>({ state: "idle" });
  const [smtpTest, setSmtpTest] = useState<TestStatus>({ state: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    getAccount(accountId).then((account) => {
      if (!account) return;
      setEmail(account.email);
      setAuthMethod(account.auth_method);
      setForm({
        displayName: account.display_name ?? "",
        imapUsername: account.imap_username ?? "",
        password: account.imap_password ?? "",
        smtpPassword: account.smtp_password ?? "",
        smtpSameAsImap: !account.smtp_password,
        imapHost: account.imap_host ?? "",
        imapPort: account.imap_port ?? 993,
        imapSecurity: (account.imap_security as SecurityType) ?? "ssl",
        smtpHost: account.smtp_host ?? "",
        smtpPort: account.smtp_port ?? 465,
        smtpSecurity: (account.smtp_security as SecurityType) ?? "ssl",
        acceptInvalidCerts: account.accept_invalid_certs === 1,
      });
      setLoading(false);
    });
  }, [accountId]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleImapSecurityChange = (security: SecurityType) => {
    setForm((prev) => ({ ...prev, imapSecurity: security, imapPort: getDefaultImapPort(security) }));
  };

  const handleSmtpSecurityChange = (security: SecurityType) => {
    setForm((prev) => ({ ...prev, smtpSecurity: security, smtpPort: getDefaultSmtpPort(security) }));
  };

  const testImap = async () => {
    setImapTest({ state: "testing" });
    try {
      const result = await invoke<string>("imap_test_connection", {
        config: {
          host: form.imapHost,
          port: form.imapPort,
          security: mapSecurity(form.imapSecurity),
          username: form.imapUsername || email,
          password: form.password,
          auth_method: authMethod === "oauth2" ? "oauth2" : "password",
          accept_invalid_certs: form.acceptInvalidCerts,
        },
      });
      setImapTest({ state: "success", message: result });
    } catch (err) {
      setImapTest({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const testSmtp = async () => {
    setSmtpTest({ state: "testing" });
    try {
      const smtpPwd = form.smtpSameAsImap ? form.password : form.smtpPassword;
      const result = await invoke<{ success: boolean; message: string }>("smtp_test_connection", {
        config: {
          host: form.smtpHost,
          port: form.smtpPort,
          security: mapSecurity(form.smtpSecurity),
          username: form.imapUsername || email,
          password: smtpPwd,
          auth_method: authMethod === "oauth2" ? "oauth2" : "password",
          accept_invalid_certs: form.acceptInvalidCerts,
        },
      });
      setSmtpTest({ state: result.success ? "success" : "error", message: result.message });
    } catch (err) {
      setSmtpTest({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateImapAccount(accountId, {
        displayName: form.displayName.trim() || null,
        imapHost: form.imapHost.trim(),
        imapPort: form.imapPort,
        imapSecurity: form.imapSecurity,
        smtpHost: form.smtpHost.trim(),
        smtpPort: form.smtpPort,
        smtpSecurity: form.smtpSecurity,
        imapUsername: form.imapUsername.trim() || null,
        newPassword: form.password || null,
        newSmtpPassword: form.smtpSameAsImap ? null : form.smtpPassword || null,
        smtpSameAsImap: form.smtpSameAsImap,
        acceptInvalidCerts: form.acceptInvalidCerts,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const renderTestIcon = (status: TestStatus) => {
    if (status.state === "testing") return <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />;
    if (status.state === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    if (status.state === "error") return <XCircle className="w-3.5 h-3.5 text-danger" />;
    return null;
  };

  if (loading) {
    return (
      <Modal isOpen onClose={onClose} title="Edit Account" width="w-full max-w-lg">
        <div className="p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
        </div>
      </Modal>
    );
  }

  const isOAuth = authMethod === "oauth2";

  return (
    <Modal isOpen onClose={onClose} title="Edit IMAP Account" width="w-full max-w-lg">
      <div className="p-4 space-y-5 max-h-[80vh] overflow-y-auto">

        {/* Identity */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Identity</h3>
          <div>
            <label className={labelClass}>Email Address</label>
            <input type="email" value={email} disabled className={`${inputClass} opacity-50 cursor-not-allowed`} />
          </div>
          <div>
            <label className={labelClass}>Display Name (optional)</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              placeholder="Your Name"
              className={inputClass}
            />
          </div>
          {!isOAuth && (
            <>
              <div>
                <label className={labelClass}>Username (optional)</label>
                <input
                  type="text"
                  value={form.imapUsername}
                  onChange={(e) => update("imapUsername", e.target.value)}
                  placeholder="Leave blank to use email address"
                  className={inputClass}
                />
                <p className="text-xs text-text-tertiary mt-1">Only needed if your login username differs from your email.</p>
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className={inputClass}
                  autoComplete="current-password"
                />
              </div>
            </>
          )}
        </div>

        {/* IMAP */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Incoming Mail (IMAP)</h3>
          <div>
            <label className={labelClass}>IMAP Server</label>
            <input
              type="text"
              value={form.imapHost}
              onChange={(e) => update("imapHost", e.target.value)}
              placeholder="imap.example.com"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Port</label>
              <input
                type="number"
                value={form.imapPort}
                onChange={(e) => update("imapPort", parseInt(e.target.value, 10) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Security</label>
              <select
                value={form.imapSecurity}
                onChange={(e) => handleImapSecurityChange(e.target.value as SecurityType)}
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
              id="edit-accept-certs"
              type="checkbox"
              checked={form.acceptInvalidCerts}
              onChange={(e) => update("acceptInvalidCerts", e.target.checked)}
              className="rounded border-border-primary text-accent focus:ring-accent"
            />
            <label htmlFor="edit-accept-certs" className="text-sm text-text-secondary">
              Accept self-signed certificates
            </label>
          </div>
          <button
            onClick={testImap}
            disabled={imapTest.state === "testing"}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-border-primary rounded-lg text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            {renderTestIcon(imapTest)}
            {imapTest.state === "testing" ? "Testing..." : "Test IMAP"}
            {imapTest.state === "error" && (
              <span className="text-danger truncate max-w-xs">{imapTest.message}</span>
            )}
            {imapTest.state === "success" && (
              <span className="text-success">OK</span>
            )}
          </button>
        </div>

        {/* SMTP */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Outgoing Mail (SMTP)</h3>
          <div>
            <label className={labelClass}>SMTP Server</label>
            <input
              type="text"
              value={form.smtpHost}
              onChange={(e) => update("smtpHost", e.target.value)}
              placeholder="smtp.example.com"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Port</label>
              <input
                type="number"
                value={form.smtpPort}
                onChange={(e) => update("smtpPort", parseInt(e.target.value, 10) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Security</label>
              <select
                value={form.smtpSecurity}
                onChange={(e) => handleSmtpSecurityChange(e.target.value as SecurityType)}
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
                  id="edit-smtp-same"
                  type="checkbox"
                  checked={form.smtpSameAsImap}
                  onChange={(e) => update("smtpSameAsImap", e.target.checked)}
                  className="rounded border-border-primary text-accent focus:ring-accent"
                />
                <label htmlFor="edit-smtp-same" className="text-sm text-text-secondary">
                  Use same password as IMAP
                </label>
              </div>
              {!form.smtpSameAsImap && (
                <div>
                  <label className={labelClass}>SMTP Password</label>
                  <input
                    type="password"
                    value={form.smtpPassword}
                    onChange={(e) => update("smtpPassword", e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className={inputClass}
                  />
                </div>
              )}
            </>
          )}
          <button
            onClick={testSmtp}
            disabled={smtpTest.state === "testing"}
            className="flex items-center gap-2 px-3 py-1.5 text-xs border border-border-primary rounded-lg text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            {renderTestIcon(smtpTest)}
            {smtpTest.state === "testing" ? "Testing..." : "Test SMTP"}
            {smtpTest.state === "error" && (
              <span className="text-danger truncate max-w-xs">{smtpTest.message}</span>
            )}
            {smtpTest.state === "success" && (
              <span className="text-success">OK</span>
            )}
          </button>
        </div>

        {saveError && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 text-sm text-danger">
            {saveError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.imapHost.trim() || !form.smtpHost.trim()}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
