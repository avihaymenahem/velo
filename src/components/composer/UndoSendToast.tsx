import { useEffect, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { useComposerStore } from "@/stores/composerStore";
import { getSetting } from "@/services/db/settings";
import { deleteOperation } from "@/services/db/pendingOperations";

export function UndoSendToast() {
  const { undoSendVisible, pendingSendOpId, setPendingSendOpId, setUndoSendVisible } =
    useComposerStore();
  const toastRef = useRef<HTMLDivElement>(null);
  const [delay, setDelay] = useState(5);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!undoSendVisible) {
      setElapsed(0);
      setProgress(1);
      startRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    getSetting("undo_send_delay_seconds").then((val) => {
      setDelay(parseInt(val ?? "5", 10));
    });

    startRef.current = Date.now();
    const totalMs = delay * 1000;

    const tick = () => {
      if (!startRef.current) return;
      const now = Date.now();
      const elapsedMs = now - startRef.current;
      setElapsed(elapsedMs / 1000);
      setProgress(Math.max(0, 1 - elapsedMs / totalMs));

      if (elapsedMs < totalMs) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [undoSendVisible, delay]);

  const handleUndo = async () => {
    if (pendingSendOpId) {
      await deleteOperation(pendingSendOpId).catch(() => {});
      setPendingSendOpId(null);
    }
    setUndoSendVisible(false);
  };

  return (
    <CSSTransition nodeRef={toastRef} in={undoSendVisible} timeout={200} classNames="toast" unmountOnExit>
      <div ref={toastRef} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-text-primary text-bg-primary rounded-lg shadow-lg overflow-hidden min-w-[280px]">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm">Sending email{elapsed > 0 ? ` in ${Math.ceil(delay - elapsed)}s` : "..."}</span>
          <button
            onClick={handleUndo}
            className="text-sm font-medium text-accent hover:text-accent-hover underline ml-auto"
          >
            Undo
          </button>
        </div>
        <div className="h-0.5 bg-white/20">
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-200 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </CSSTransition>
  );
}
