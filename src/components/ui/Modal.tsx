import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CSSTransition } from "react-transition-group";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  /** Custom z-index class (default: "z-50") */
  zIndex?: string;
  /** Additional classes on the panel container */
  panelClassName?: string;
  /** Replace the default header entirely */
  renderHeader?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  width = "w-72",
  zIndex = "z-50",
  panelClassName,
  renderHeader,
}: ModalProps) {
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return createPortal(
    <CSSTransition in={isOpen} timeout={150} classNames="modal" unmountOnExit nodeRef={nodeRef}>
      <div ref={nodeRef} className={`fixed inset-0 ${zIndex} flex items-center justify-center`} onContextMenu={(e) => e.stopPropagation()}>
        <div className="absolute inset-0 bg-black/20 glass-backdrop" onClick={onClose} />
        <div
          className={`relative bg-bg-primary border border-border-primary rounded-lg glass-modal ${width}${panelClassName ? ` ${panelClassName}` : ""}`}
        >
          {renderHeader !== undefined ? (
            renderHeader
          ) : (
            <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              <button
                onClick={onClose}
                className="text-text-tertiary hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </CSSTransition>,
    document.body,
  );
}
