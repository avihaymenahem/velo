import { useRef } from "react";
import { CSSTransition } from "react-transition-group";
import { t } from "@/i18n";
import { useComposerStore } from "@/stores/composerStore";
import { useOutgoingStore } from "@/stores/outgoingStore";

const UNDO_DELAY_SECONDS = 5;

export function UndoSendToast() {
  const { undoSendVisible, undoSendTimer, setUndoSendTimer, setUndoSendVisible, setIsSending, closeComposer } =
    useComposerStore();
  const toastRef = useRef<HTMLDivElement>(null);

  const handleUndo = () => {
    if (undoSendTimer) {
      clearTimeout(undoSendTimer);
      setUndoSendTimer(null);
    }
    useOutgoingStore.getState().clearUndoEmails();
    setUndoSendVisible(false);
    setIsSending(false);
    closeComposer();
  };

  return (
    <CSSTransition nodeRef={toastRef} in={undoSendVisible} timeout={200} classNames="toast" unmountOnExit>
      <div ref={toastRef} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-text-primary text-bg-primary rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-3">
          <span className="text-sm">{t("composer.undoSend.sending")}</span>
          <button
            onClick={handleUndo}
            className="text-sm font-medium text-accent hover:text-accent-hover underline"
          >
            {t("composer.undoSend.undo")}
          </button>
        </div>
        <div className="h-0.5 bg-white/20">
          <div
            className="h-full bg-accent rounded-full"
            style={{ animation: `countdownBar ${UNDO_DELAY_SECONDS}s linear forwards` }}
          />
        </div>
      </div>
    </CSSTransition>
  );
}
