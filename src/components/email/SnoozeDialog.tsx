import { useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";

interface SnoozeDialogProps {
  isOpen?: boolean;
  onSnooze: (until: number) => void;
  onClose: () => void;
}

function getSnoozePresets(): { label: string; timestamp: number }[] {
  const now = new Date();
  const today = new Date(now);

  // Later today: 3 hours from now (or 5pm if before 2pm)
  const laterToday = new Date(now);
  if (now.getHours() < 14) {
    laterToday.setHours(17, 0, 0, 0);
  } else {
    laterToday.setTime(now.getTime() + 3 * 60 * 60 * 1000);
  }

  // Tomorrow 9am
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  // This weekend (Saturday 9am)
  const weekend = new Date(today);
  const dayOfWeek = weekend.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  weekend.setDate(weekend.getDate() + daysUntilSaturday);
  weekend.setHours(9, 0, 0, 0);

  // Next week (Monday 9am)
  const nextWeek = new Date(today);
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: "Later Today", timestamp: Math.floor(laterToday.getTime() / 1000) },
    { label: "Tomorrow", timestamp: Math.floor(tomorrow.getTime() / 1000) },
    { label: "This Weekend", timestamp: Math.floor(weekend.getTime() / 1000) },
    { label: "Next Week", timestamp: Math.floor(nextWeek.getTime() / 1000) },
  ];
}

export function SnoozeDialog({ isOpen = true, onSnooze, onClose }: SnoozeDialogProps) {
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const presets = getSnoozePresets();
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleCustomSnooze = () => {
    if (!customDate) return;
    const dt = new Date(`${customDate}T${customTime}`);
    onSnooze(Math.floor(dt.getTime() / 1000));
  };

  return (
    <CSSTransition nodeRef={overlayRef} in={isOpen} timeout={200} classNames="modal" unmountOnExit>
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-72 modal-panel">
        <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Snooze until...
          </h3>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="py-1">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onSnooze(preset.timestamp)}
              className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors flex items-center justify-between"
            >
              <span>{preset.label}</span>
              <span className="text-xs text-text-tertiary">
                {new Date(preset.timestamp * 1000).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-border-secondary px-4 py-3 space-y-2">
          <div className="text-xs text-text-tertiary font-medium">
            Custom date & time
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary"
            />
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="w-20 bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary"
            />
          </div>
          <button
            onClick={handleCustomSnooze}
            disabled={!customDate}
            className="w-full text-center px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
          >
            Snooze
          </button>
        </div>
      </div>
    </div>
    </CSSTransition>
  );
}
