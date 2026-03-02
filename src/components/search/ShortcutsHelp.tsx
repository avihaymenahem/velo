import { useTranslation } from "react-i18next";
import { SHORTCUTS } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";
import { Modal } from "@/components/ui/Modal";

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const { t } = useTranslation("search");
  const keyMap = useShortcutStore((s) => s.keyMap);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("keyboardShortcuts")} width="w-full max-w-lg" zIndex="z-[60]">
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
    </Modal>
  );
}
