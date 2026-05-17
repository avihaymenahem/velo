import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { getSetting, setSetting, getSecureSetting, setSecureSetting } from "@/services/db/settings";
import { reauthorizeAccount } from "@/services/gmail/tokenManager";
import { updateAccountMeta, getAllAccounts } from "@/services/db/accounts";
import { useAccountStore } from "@/stores/accountStore";
import { ACCOUNT_COLOR_PRESETS } from "@/constants/accountColors";

const labelClass = "block text-xs font-medium text-text-secondary mb-1";

interface EditGmailAccountProps {
  accountId: string;
  email: string;
  displayName?: string | null;
  initialColor?: string | null;
  initialIncludeInGlobal?: boolean;
  onClose: () => void;
}

export function EditGmailAccount({
  accountId,
  email,
  displayName,
  initialColor = null,
  initialIncludeInGlobal = true,
  onClose,
}: EditGmailAccountProps) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [apiSaved, setApiSaved] = useState(false);
  const [reauthStatus, setReauthStatus] = useState<"idle" | "authorizing" | "done" | "error">("idle");
  const [color, setColor] = useState<string | null>(initialColor);
  const [includeInGlobal, setIncludeInGlobal] = useState(initialIncludeInGlobal);

  useEffect(() => {
    getSetting("google_client_id").then((v) => setClientId(v ?? ""));
    getSecureSetting("google_client_secret").then((v) => setClientSecret(v ?? ""));
  }, []);

  const refreshAccountStore = async () => {
    const dbAccounts = await getAllAccounts();
    useAccountStore.getState().setAccounts(
      dbAccounts.map((a) => ({
        id: a.id,
        email: a.email,
        displayName: a.display_name,
        avatarUrl: a.avatar_url,
        isActive: a.is_active === 1,
        provider: a.provider,
        color: a.color ?? null,
        includeInGlobal: a.include_in_global !== 0,
        sortOrder: a.sort_order ?? 0,
      })),
      useAccountStore.getState().activeAccountId ?? undefined,
    );
    window.dispatchEvent(new CustomEvent("velo-sync-done"));
  };

  const handleColorChange = async (newColor: string | null) => {
    setColor(newColor);
    await updateAccountMeta(accountId, { color: newColor });
    await refreshAccountStore();
  };

  const handleIncludeInGlobalChange = async () => {
    const next = !includeInGlobal;
    setIncludeInGlobal(next);
    await updateAccountMeta(accountId, { includeInGlobal: next });
    await refreshAccountStore();
  };

  const handleReauthorize = async () => {
    setReauthStatus("authorizing");
    try {
      await reauthorizeAccount(accountId, email);
      setReauthStatus("done");
      setTimeout(() => setReauthStatus("idle"), 3000);
    } catch (err) {
      console.error("Re-authorization failed:", err);
      setReauthStatus("error");
      setTimeout(() => setReauthStatus("idle"), 3000);
    }
  };

  const handleSaveApi = async () => {
    const trimmedId = clientId.trim();
    if (!trimmedId) return;
    await setSetting("google_client_id", trimmedId);
    const trimmedSecret = clientSecret.trim();
    if (trimmedSecret) {
      await setSecureSetting("google_client_secret", trimmedSecret);
    }
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  return (
    <Modal isOpen title={displayName ?? email} onClose={onClose} width="w-96">
      <div className="p-4 space-y-6 max-h-[80vh] overflow-y-auto">
        <div className="text-xs text-text-tertiary -mt-2">{email}</div>

        {/* Account color */}
        <div>
          <label className={labelClass}>Account Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {ACCOUNT_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleColorChange(color === preset ? null : preset)}
                className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-accent"
                style={{ backgroundColor: preset }}
                title={preset}
              >
                {color === preset && <Check size={12} className="text-white" strokeWidth={3} />}
              </button>
            ))}
            {color && (
              <button
                type="button"
                onClick={() => handleColorChange(null)}
                className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Unified inbox */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={includeInGlobal}
            onClick={handleIncludeInGlobalChange}
            className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 ${includeInGlobal ? "bg-accent" : "bg-border-primary"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeInGlobal ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
          <label
            className="text-sm text-text-secondary cursor-pointer select-none"
            onClick={handleIncludeInGlobalChange}
          >
            Include in unified inbox
          </label>
        </div>

        {/* Authorization */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Authorization</div>
          <p className="text-xs text-text-tertiary">
            Re-authorize if you're experiencing authentication errors.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReauthorize}
            disabled={reauthStatus === "authorizing"}
          >
            {reauthStatus === "authorizing" && "Waiting..."}
            {reauthStatus === "done" && "Done!"}
            {reauthStatus === "error" && "Failed"}
            {reauthStatus === "idle" && "Re-authorize"}
          </Button>
        </div>

        {/* Google API */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">Google API</div>
          <TextField
            label="Client ID"
            size="md"
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Google OAuth Client ID"
          />
          <TextField
            label="Client Secret"
            size="md"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Google OAuth Client Secret"
          />
          <Button
            variant="primary"
            size="md"
            onClick={handleSaveApi}
            disabled={!clientId.trim()}
          >
            {apiSaved ? "Saved!" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
