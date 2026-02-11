import { useState } from "react";

interface ScheduleSendDialogProps {
  onSchedule: (timestamp: number) => void;
  onClose: () => void;
}

function getSchedulePresets(): { label: string; detail: string; timestamp: number }[] {
  const now = new Date();
  const today = new Date(now);

  // Tomorrow morning 9am
  const tomorrowMorning = new Date(today);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  // Tomorrow afternoon 1pm
  const tomorrowAfternoon = new Date(today);
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
  tomorrowAfternoon.setHours(13, 0, 0, 0);

  // Monday morning 9am
  const monday = new Date(today);
  const dayOfWeek = monday.getDay();
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
  monday.setDate(monday.getDate() + daysUntilMonday);
  monday.setHours(9, 0, 0, 0);

  return [
    {
      label: "Tomorrow morning",
      detail: tomorrowMorning.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " 9:00 AM",
      timestamp: Math.floor(tomorrowMorning.getTime() / 1000),
    },
    {
      label: "Tomorrow afternoon",
      detail: tomorrowAfternoon.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " 1:00 PM",
      timestamp: Math.floor(tomorrowAfternoon.getTime() / 1000),
    },
    {
      label: "Monday morning",
      detail: monday.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " 9:00 AM",
      timestamp: Math.floor(monday.getTime() / 1000),
    },
  ];
}

export function ScheduleSendDialog({ onSchedule, onClose }: ScheduleSendDialogProps) {
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");
  const presets = getSchedulePresets();

  const handleCustomSchedule = () => {
    if (!customDate) return;
    const dt = new Date(`${customDate}T${customTime}`);
    onSchedule(Math.floor(dt.getTime() / 1000));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-72">
        <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            Schedule send
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
              onClick={() => onSchedule(preset.timestamp)}
              className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors flex items-center justify-between"
            >
              <span>{preset.label}</span>
              <span className="text-xs text-text-tertiary">{preset.detail}</span>
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
            onClick={handleCustomSchedule}
            disabled={!customDate}
            className="w-full text-center px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
