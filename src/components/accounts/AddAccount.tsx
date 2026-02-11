import { useState } from "react";
import { startOAuthFlow } from "@/services/gmail/auth";
import { insertAccount } from "@/services/db/accounts";
import { getClientId, getClientSecret } from "@/services/gmail/tokenManager";
import { useAccountStore } from "@/stores/accountStore";
import { SetupClientId } from "./SetupClientId";

interface AddAccountProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAccount({ onClose, onSuccess }: AddAccountProps) {
  const [status, setStatus] = useState<
    "idle" | "checking" | "authenticating" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const addAccount = useAccountStore((s) => s.addAccount);

  const handleAddAccount = async () => {
    setStatus("checking");
    setError(null);

    try {
      const clientId = await getClientId();
      const clientSecret = await getClientSecret();
      setStatus("authenticating");

      const { tokens, userInfo } = await startOAuthFlow(clientId, clientSecret);

      const accountId = crypto.randomUUID();
      const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

      await insertAccount({
        id: accountId,
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? "",
        tokenExpiresAt: expiresAt,
      });

      addAccount({
        id: accountId,
        email: userInfo.email,
        displayName: userInfo.name,
        avatarUrl: userInfo.picture,
        isActive: true,
      });

      onSuccess();
    } catch (err) {
      console.error("Add account error:", err);
      const message =
        err instanceof Error ? err.message : String(err);
      if (message.includes("Client ID not configured")) {
        setNeedsSetup(true);
      } else {
        setError(message);
        setStatus("error");
      }
    }
  };

  if (needsSetup) {
    return (
      <SetupClientId
        onComplete={() => {
          setNeedsSetup(false);
          setStatus("idle");
        }}
        onCancel={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 glass-backdrop">
      <div className="bg-bg-primary border border-border-primary rounded-xl glass-modal w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-2">Add Gmail Account</h2>
        <p className="text-text-secondary text-sm mb-6">
          Sign in with your Google account to connect it to Velo.
        </p>

        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4 text-sm text-danger">
            {error}
          </div>
        )}

        {status === "authenticating" && (
          <div className="text-center py-4 text-text-secondary text-sm">
            <div className="mb-2">Waiting for Google sign-in...</div>
            <div className="text-xs text-text-tertiary">
              Complete the sign-in in your browser, then return here.
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddAccount}
            disabled={status === "authenticating" || status === "checking"}
            className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "authenticating"
              ? "Waiting..."
              : status === "checking"
                ? "Checking..."
                : "Sign in with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}
