import { useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";

interface FollowUpDialogProps {
  isOpen?: boolean;
  onSetReminder: (remindAt: number) => void;
  onClose: () => void;
}

function getFollowUpPresets(): { label: string; timestamp: number }[] {
  const now = new Date();

  // In 1 day
  const oneDay = new Date(now);
  oneDay.setDate(oneDay.getDate() + 1);
  oneDay.setHours(9, 0, 0, 0);

  // In 2 days
  const twoDays = new Date(now);
  twoDays.setDate(twoDays.getDate() + 2);
  twoDays.setHours(9, 0, 0, 0);

  // In 3 days
  const threeDays = new Date(now);
  threeDays.setDate(threeDays.getDate() + 3);
  threeDays.setHours(9, 0, 0, 0);

  // In 1 week
  const oneWeek = new Date(now);
  oneWeek.setDate(oneWeek.getDate() + 7);
  oneWeek.setHours(9, 0, 0, 0);

  return [
    { label: "In 1 day", timestamp: Math.floor(oneDay.getTime() / 1000) },
    { label: "In 2 days", timestamp: Math.floor(twoDays.getTime() / 1000) },
    { label: "In 3 days", timestamp: Math.floor(threeDays.getTime() / 1000) },
    { label: "In 1 week", timestamp: Math.floor(oneWeek.getTime() / 1000) },
  ];
}

export function FollowUpDialog({ isOpen = true, onSetReminder, onClose }: FollowUpDialogProps) {
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const presets = getFollowUpPresets();
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleCustomReminder = () => {
    if (!customDate) return;
    const dt = new Date(`${customDate}T${customTime}`);
    onSetReminder(Math.floor(dt.getTime() / 1000));
  };

  return (
    <CSSTransition nodeRef={overlayRef} in={isOpen} timeout={200} classNames="modal" unmountOnExit>
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-72 modal-panel">
        <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Remind me if no reply...
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
              onClick={() => onSetReminder(preset.timestamp)}
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
            onClick={handleCustomReminder}
            disabled={!customDate}
            className="w-full text-center px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
          >
            Set reminder
          </button>
        </div>
      </div>
    </div>
    </CSSTransition>
  );
}
