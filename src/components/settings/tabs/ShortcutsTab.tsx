import { useState, useEffect, useCallback, useRef } from "react";
import { useShortcutStore } from "@/stores/shortcutStore";
import { SHORTCUTS, getDefaultKeyMap } from "@/constants/shortcuts";
import { registerComposeShortcut, getCurrentShortcut, DEFAULT_SHORTCUT } from "@/services/globalShortcut";
import { Section } from "./shared";
import { t } from "@/i18n";

export function ShortcutsTab() {
  const keyMap = useShortcutStore((s) => s.keyMap);
  const setKey = useShortcutStore((s) => s.setKey);
  const resetKey = useShortcutStore((s) => s.resetKey);
  const resetAll = useShortcutStore((s) => s.resetAll);
  const defaults = getDefaultKeyMap();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [composeShortcut, setComposeShortcut] = useState(DEFAULT_SHORTCUT);
  const [recordingGlobal, setRecordingGlobal] = useState(false);
  const globalRecorderRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const current = getCurrentShortcut();
    if (current) setComposeShortcut(current);
  }, []);

  const handleGlobalRecord = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recordingGlobal) return;
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("CmdOrCtrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      const key = e.key;
      if (key !== "Control" && key !== "Meta" && key !== "Shift" && key !== "Alt") {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
        const shortcut = parts.join("+");
        setComposeShortcut(shortcut);
        setRecordingGlobal(false);
        registerComposeShortcut(shortcut).catch((err) => {
          console.error("Failed to register shortcut:", err);
        });
      }
    },
    [recordingGlobal],
  );

  const handleKeyRecord = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      const key = e.key;
      if (key === "Control" || key === "Meta" || key === "Shift" || key === "Alt") return;

      if (parts.length > 0) {
        parts.push(key.length === 1 ? key.toUpperCase() : key);
      } else {
        parts.push(key);
      }

      setKey(id, parts.join("+"));
      setRecordingId(null);
    },
    [setKey],
  );

  const hasCustom = Object.entries(keyMap).some(([id, keys]) => defaults[id] !== keys);

  return (
    <>
      <Section title={t("settings.shortcuts.globalShortcut")}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-text-secondary">{t("settings.shortcuts.quickCompose")}</span>
            <p className="text-xs text-text-tertiary mt-0.5">
              {t("settings.shortcuts.quickComposeDesc")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="text-xs bg-bg-tertiary px-2 py-1 rounded border border-border-primary font-mono">
              {composeShortcut}
            </kbd>
            <button
              ref={globalRecorderRef}
              onClick={() => setRecordingGlobal(true)}
              onKeyDown={handleGlobalRecord}
              onBlur={() => setRecordingGlobal(false)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                recordingGlobal
                  ? "bg-accent text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary"
              }`}
            >
              {recordingGlobal ? t("settings.shortcuts.pressKeys") : t("settings.shortcuts.change")}
            </button>
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-text-tertiary">
          {t("settings.shortcuts.rebindHint")}
        </p>
        {hasCustom && (
          <button
            onClick={resetAll}
            className="text-xs text-accent hover:text-accent-hover transition-colors shrink-0 ml-4"
          >
            {t("settings.shortcuts.resetAll")}
          </button>
        )}
      </div>
      {SHORTCUTS.map((section) => (
        <Section key={section.category} title={t(`settings.shortcuts.categories.${section.category.toLowerCase()}`)}>
          <div className="space-y-1">
            {section.items.map((item) => {
              const currentKey = keyMap[item.id] ?? item.keys;
              const isDefault = currentKey === defaults[item.id];
              const isRecording = recordingId === item.id;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 px-1"
                >
                  <span className="text-sm text-text-secondary">
                    {t(`settings.shortcuts.items.${item.id}`)}
                  </span>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => setRecordingId(isRecording ? null : item.id)}
                      onKeyDown={(e) => {
                        if (isRecording) handleKeyRecord(e, item.id);
                      }}
                      onBlur={() => {
                        if (isRecording) setRecordingId(null);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-md font-mono transition-colors ${
                        isRecording
                          ? "bg-accent text-white"
                          : "bg-bg-tertiary text-text-tertiary hover:text-text-primary border border-border-primary"
                      }`}
                    >
                      {isRecording ? t("settings.shortcuts.pressKey") : currentKey}
                    </button>
                    {!isDefault && (
                      <button
                        onClick={() => resetKey(item.id)}
                        className="text-xs text-text-tertiary hover:text-text-primary"
                        title={t("settings.shortcuts.resetToDefault", { key: defaults[item.id] ?? "" })}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </>
  );
}
