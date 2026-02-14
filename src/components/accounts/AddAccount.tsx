import { useState } from "react";
import { Mail } from "lucide-react";
import { startOAuthFlow } from "@/services/gmail/auth";
import { insertAccount } from "@/services/db/accounts";
import { getClientId, getClientSecret } from "@/services/gmail/tokenManager";
import { useAccountStore } from "@/stores/accountStore";
import { Modal } from "@/components/ui/Modal";
import { SetupClientId } from "./SetupClientId";
import { AddImapAccount } from "./AddImapAccount";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";

interface AddAccountProps {
  onClose: () => void;
  onSuccess: () => void;
}

type View = "select-provider" | "gmail" | "imap";

export function AddAccount({ onClose, onSuccess }: AddAccountProps) {
  const [view, setView] = useState<View>("select-provider");
  const [status, setStatus] = useState<
    "idle" | "checking" | "authenticating" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const addAccount = useAccountStore((s) => s.addAccount);

  const handleAddGmailAccount = async () => {
    setStatus("checking");
    setError(null);

    try {
      const clientId = await getClientId();
      const clientSecret = await getClientSecret();
      setStatus("authenticating");

      const { tokens, userInfo } = await startOAuthFlow(clientId, clientSecret);

      const accountId = crypto.randomUUID();
      const expiresAt = getCurrentUnixTimestamp() + tokens.expires_in;

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

  if (view === "imap") {
    return (
      <AddImapAccount
        onClose={onClose}
        onSuccess={onSuccess}
        onBack={() => setView("select-provider")}
      />
    );
  }

  if (view === "gmail") {
    return (
      <Modal isOpen={true} onClose={onClose} title="Add Gmail Account" width="w-full max-w-md">
        <div className="p-4">
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

          <div className="flex gap-3 justify-between">
            <button
              onClick={() => {
                setView("select-provider");
                setStatus("idle");
                setError(null);
              }}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Back
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGmailAccount}
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
      </Modal>
    );
  }

  // Provider selection view
  return (
    <Modal isOpen={true} onClose={onClose} title="Add Account" width="w-full max-w-md">
      <div className="p-4">
        <p className="text-text-secondary text-sm mb-4">
          Choose how you want to connect your email account.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => setView("gmail")}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-border-primary bg-bg-secondary hover:bg-bg-hover transition-colors text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                Google (Gmail)
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">
                Connect via OAuth with full Gmail API support
              </div>
            </div>
          </button>

          <button
            onClick={() => setView("imap")}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-border-primary bg-bg-secondary hover:bg-bg-hover transition-colors text-left group"
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center">
              <Mail className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                IMAP / SMTP
              </div>
              <div className="text-xs text-text-tertiary mt-0.5">
                Connect any email provider with manual server configuration
              </div>
            </div>
          </button>
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
