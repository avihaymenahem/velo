import { useState } from "react";
import { setSetting, setSecureSetting } from "@/services/db/settings";

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
    if (!trimmedId) return;

    setSaving(true);
    try {
      await setSetting("google_client_id", trimmedId);
      const trimmedSecret = clientSecret.trim();
      if (trimmedSecret) {
        await setSecureSetting("google_client_secret", trimmedSecret);
      }
      onComplete();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 glass-backdrop">
      <div className="bg-bg-primary border border-border-primary rounded-xl glass-modal w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-2">Google API Setup</h2>
        <p className="text-text-secondary text-sm mb-4">
          To connect Gmail accounts, you need a Google Cloud OAuth Client ID.
        </p>

        <ol className="text-text-secondary text-sm mb-4 space-y-1 list-decimal list-inside">
          <li>
            Go to the{" "}
            <span className="text-accent">Google Cloud Console</span>
          </li>
          <li>Create a project (or use an existing one)</li>
          <li>Enable the Gmail API</li>
          <li>
            Create OAuth 2.0 credentials (Web application type)
          </li>
          <li>
            Add <code className="bg-bg-tertiary px-1 rounded text-xs">http://127.0.0.1:17248</code>{" "}
            as an authorized redirect URI
          </li>
          <li>Copy the Client ID and Client Secret below</li>
        </ol>

        <input
          type="text"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Paste your Client ID here..."
          className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm mb-3 outline-none focus:border-accent"
        />

        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Paste your Client Secret here..."
          className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm mb-4 outline-none focus:border-accent"
        />

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!clientId.trim() || saving}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
