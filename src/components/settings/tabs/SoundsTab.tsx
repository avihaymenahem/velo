import { useState, useEffect, useCallback } from "react";
import { Play } from "lucide-react";
import { getSetting, setSetting } from "@/services/db/settings";
import { previewSound, type SoundEvent } from "@/services/soundService";
import { Section, ToggleRow } from "./shared";
import { t } from "@/i18n";

const SOUND_EVENTS: { event: SoundEvent; labelKey: string; descKey: string }[] = [
  { event: "send", labelKey: "settings.sounds.events.send", descKey: "settings.sounds.events.sendDesc" },
  { event: "receive", labelKey: "settings.sounds.events.receive", descKey: "settings.sounds.events.receiveDesc" },
  { event: "task_complete", labelKey: "settings.sounds.events.taskComplete", descKey: "settings.sounds.events.taskCompleteDesc" },
  { event: "event_alert", labelKey: "settings.sounds.events.eventAlert", descKey: "settings.sounds.events.eventAlertDesc" },
  { event: "send_error", labelKey: "settings.sounds.events.sendError", descKey: "settings.sounds.events.sendErrorDesc" },
  { event: "shortcut_click", labelKey: "settings.sounds.events.shortcutClick", descKey: "settings.sounds.events.shortcutClickDesc" },
];

export function SoundsTab() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const [eventEnabled, setEventEnabled] = useState<Record<SoundEvent, boolean>>({
    send: true,
    receive: true,
    task_complete: true,
    event_alert: true,
    send_error: true,
    shortcut_click: false,
  });

  useEffect(() => {
    async function load() {
      const enabled = await getSetting("sound_enabled");
      setSoundEnabled(enabled !== "false");

      const vol = await getSetting("sound_volume");
      if (vol) setVolume(parseFloat(vol));

      const updates: Partial<Record<SoundEvent, boolean>> = {};
      for (const { event } of SOUND_EVENTS) {
        const raw = await getSetting(`sound_${event}_enabled`);
        // shortcut_click defaults to false, all others default to true
        const defaultOn = event !== "shortcut_click";
        updates[event] = raw === null ? defaultOn : raw !== "false";
      }
      setEventEnabled((prev) => ({ ...prev, ...updates }));
    }
    load();
  }, []);

  const handleMasterToggle = useCallback(async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    await setSetting("sound_enabled", next ? "true" : "false");
  }, [soundEnabled]);

  const handleVolumeChange = useCallback(async (val: number) => {
    setVolume(val);
    await setSetting("sound_volume", String(val));
  }, []);

  const handleEventToggle = useCallback(async (event: SoundEvent) => {
    const next = !eventEnabled[event];
    setEventEnabled((prev) => ({ ...prev, [event]: next }));
    await setSetting(`sound_${event}_enabled`, next ? "true" : "false");
  }, [eventEnabled]);

  const handlePreview = useCallback((event: SoundEvent) => {
    void previewSound(event, volume);
  }, [volume]);

  return (
    <>
      <Section title={t("settings.sounds.sections.master")}>
        <ToggleRow
          label={t("settings.sounds.enableSounds")}
          checked={soundEnabled}
          onToggle={handleMasterToggle}
        />
        <div className={`transition-opacity ${soundEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-text-secondary">{t("settings.sounds.volume")}</span>
              <p className="text-xs text-text-tertiary mt-0.5">{t("settings.sounds.volumeDesc")}</p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => void handleVolumeChange(parseFloat(e.target.value))}
                className="w-28 accent-accent cursor-pointer"
              />
              <span className="text-xs text-text-tertiary w-8 text-right">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("settings.sounds.sections.events")}>
        <p className="text-xs text-text-tertiary -mt-1 mb-1">{t("settings.sounds.eventsDesc")}</p>
        <div className={`space-y-1 transition-opacity ${soundEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          {SOUND_EVENTS.map(({ event, labelKey, descKey }) => (
            <div key={event} className="flex items-center justify-between py-1">
              <div className="flex-1 min-w-0">
                <span className="text-sm text-text-secondary">{t(labelKey as Parameters<typeof t>[0])}</span>
                <p className="text-xs text-text-tertiary mt-0.5">{t(descKey as Parameters<typeof t>[0])}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <button
                  onClick={() => handlePreview(event)}
                  title={t("settings.sounds.preview")}
                  className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
                >
                  <Play size={12} />
                </button>
                <button
                  onClick={() => void handleEventToggle(event)}
                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                    eventEnabled[event] ? "bg-accent" : "bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
                      eventEnabled[event] ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
