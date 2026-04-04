import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface Preset {
  label: string;
  /** Unix timestamp in seconds */
  timestamp: number;
  /** Optional custom detail string; if omitted, a default date format is used */
  detail?: string;
}

interface DateTimePickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  presets: Preset[];
  /** Called with a Unix timestamp in seconds */
  onSelect: (timestamp: number) => void;
  submitLabel: string;
  zIndex?: string;
}

export function DateTimePickerDialog({
  isOpen,
  onClose,
  title,
  presets,
  onSelect,
  submitLabel,
  zIndex,
}: DateTimePickerDialogProps) {
  const { t } = useTranslation();
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("09:00");

  const handlePresetClick = (timestamp: number) => {
    onSelect(timestamp);
  };

  const handleCustomSubmit = () => {
    if (!customDate) return;
    const dt = new Date(`${customDate}T${customTime}`);
    onSelect(Math.floor(dt.getTime() / 1000));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} zIndex={zIndex}>
      <div className="py-1">
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset.timestamp)}
            className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors flex items-center justify-between"
          >
            <span>{preset.label}</span>
            <span className="text-xs text-text-tertiary">
              {preset.detail ??
                new Date(preset.timestamp * 1000).toLocaleDateString(
                  undefined,
                  { weekday: "short", month: "short", day: "numeric" },
                )}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t border-border-secondary px-4 py-3 space-y-2">
        <div className="text-xs text-text-tertiary font-medium">
          {t("dateTimePicker.customDateTime")}
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
        <Button
          variant="primary"
          onClick={handleCustomSubmit}
          disabled={!customDate}
          className="w-full"
        >
          {submitLabel}
        </Button>
      </div>
    </Modal>
  );
}
