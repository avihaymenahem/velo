import { useRef } from "react";
import { CSSTransition } from "react-transition-group";
import { SHORTCUTS } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const keyMap = useShortcutStore((s) => s.keyMap);
  const overlayRef = useRef<HTMLDivElement>(null);

  return (
    <CSSTransition nodeRef={overlayRef} in={isOpen} timeout={200} classNames="modal" unmountOnExit>
    <div ref={overlayRef} className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-lg overflow-hidden modal-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <h2 className="text-sm font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {SHORTCUTS.map((section) => (
            <div key={section.category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                {section.category}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-text-secondary">
                      {item.desc}
                    </span>
                    <kbd className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded font-mono">
                      {keyMap[item.id] ?? item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </CSSTransition>
  );
}
