import { useState, useEffect, useRef, useCallback } from "react";
import { CSSTransition } from "react-transition-group";
import {
  setUpdateCallback,
  installUpdate,
  getAvailableUpdate,
} from "@/services/updateManager";

export function UpdateToast() {
  const [version, setVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pick up any update found before this component mounted
    const existing = getAvailableUpdate();
    if (existing) setVersion(existing.version);

    setUpdateCallback((update) => setVersion(update.version));
    return () => setUpdateCallback(null);
  }, []);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      await installUpdate();
    } catch (err) {
      console.error("Update install failed:", err);
      setInstalling(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setVersion(null);
  }, []);

  return (
    <CSSTransition
      nodeRef={toastRef}
      in={version !== null}
      timeout={200}
      classNames="toast"
      unmountOnExit
    >
      <div
        ref={toastRef}
        className="fixed bottom-4 right-4 z-50 glass-panel rounded-lg shadow-lg overflow-hidden max-w-xs"
      >
        <div className="px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-text-primary">
            Velo v{version} is available
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              disabled={installing}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Later
            </button>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
            >
              {installing ? "Updating..." : "Update Now"}
            </button>
          </div>
        </div>
      </div>
    </CSSTransition>
  );
}
