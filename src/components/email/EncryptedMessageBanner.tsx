import { useState, useEffect, useCallback } from "react";
import { Lock, Loader2, AlertCircle } from "lucide-react";
import {
  decryptMessage,
  getCachedPassphrase,
  cachePassphrase,
  getPrivateKeyArmored,
} from "@/services/pgp/pgpService";

interface EncryptedMessageBannerProps {
  messageId: string;
  accountId: string;
  ciphertext: string;
  onDecrypted: (plaintext: string) => void;
}

type BannerState = "detecting" | "ready" | "loading" | "error";

export function EncryptedMessageBanner({
  accountId,
  ciphertext,
  onDecrypted,
}: EncryptedMessageBannerProps) {
  const [bannerState, setBannerState] = useState<BannerState>("detecting");
  const [passphrase, setPassphrase] = useState("");
  const [rememberPassphrase, setRememberPassphrase] = useState(false);
  const [hasCachedPassphrase, setHasCachedPassphrase] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ciphertext.includes("-----BEGIN PGP MESSAGE-----")) {
      setErrorMessage("Not a valid PGP encrypted message");
      setBannerState("error");
      return;
    }
    const cached = getCachedPassphrase(accountId);
    if (cached) {
      setHasCachedPassphrase(true);
    }
    setBannerState("ready");
  }, [ciphertext, accountId]);

  const performDecrypt = useCallback(
    async (pass: string) => {
      setBannerState("loading");
      setErrorMessage(null);
      try {
        const privateKeyArmored = await getPrivateKeyArmored(accountId);
        if (!privateKeyArmored) {
          throw new Error("No private key found for this account. Add a PGP key in Settings.");
        }
        const plaintext = await decryptMessage(ciphertext, privateKeyArmored, pass);
        if (rememberPassphrase) {
          cachePassphrase(accountId, pass);
        }
        onDecrypted(plaintext);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Decryption failed. Check your passphrase and key.",
        );
        setBannerState("error");
      }
    },
    [accountId, ciphertext, rememberPassphrase, onDecrypted],
  );

  const handleDecrypt = useCallback(() => {
    const cached = getCachedPassphrase(accountId);
    if (cached) {
      performDecrypt(cached);
    } else {
      performDecrypt(passphrase);
    }
  }, [accountId, passphrase, performDecrypt]);

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setBannerState("ready");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && passphrase.trim()) {
        handleDecrypt();
      }
    },
    [passphrase, handleDecrypt],
  );

  if (bannerState === "detecting") {
    return (
      <div className="mx-4 my-2 px-3 py-2.5 rounded-lg border bg-bg-secondary/50 border-border-primary flex items-center gap-3">
        <Loader2 size={18} className="shrink-0 animate-spin text-text-tertiary" />
        <span className="text-xs text-text-tertiary">Checking for PGP encrypted message...</span>
      </div>
    );
  }

  return (
    <div className="mx-4 my-2 px-3 py-2.5 rounded-lg border bg-bg-secondary border-border-primary">
      <div className="flex items-start gap-3">
        {bannerState === "error" ? (
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-danger" />
        ) : (
          <Lock size={18} className="shrink-0 mt-0.5 text-accent" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary">
            {bannerState === "error"
              ? "Failed to decrypt message"
              : "This message is encrypted with PGP"}
          </p>

          {bannerState === "ready" && !hasCachedPassphrase && (
            <div className="mt-2 space-y-2">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter passphrase"
                className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border-primary bg-bg-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberPassphrase}
                    onChange={(e) => setRememberPassphrase(e.target.checked)}
                    className="rounded border-border-secondary text-accent focus:ring-accent"
                  />
                  <span className="text-xs text-text-tertiary">Remember for 15 min</span>
                </label>
                <button
                  onClick={handleDecrypt}
                  disabled={!passphrase.trim()}
                  className="ml-auto text-xs px-2.5 py-1 rounded-md border border-accent/30 text-accent hover:bg-accent/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Decrypt
                </button>
              </div>
            </div>
          )}

          {bannerState === "ready" && hasCachedPassphrase && (
            <div className="mt-2">
              <button
                onClick={handleDecrypt}
                className="text-xs px-2.5 py-1 rounded-md border border-accent/30 text-accent hover:bg-accent/5 transition-colors"
              >
                Decrypt message
              </button>
            </div>
          )}

          {bannerState === "loading" && (
            <div className="flex items-center gap-2 mt-1.5">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span className="text-xs text-text-tertiary">Decrypting...</span>
            </div>
          )}

          {bannerState === "error" && (
            <div className="mt-1.5 space-y-1">
              <p className="text-xs text-danger/80">{errorMessage}</p>
              <button
                onClick={handleRetry}
                className="text-xs px-2.5 py-1 rounded-md border border-border-primary text-text-secondary hover:bg-bg-hover transition-colors"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
