import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccountStore } from "@/stores/accountStore";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { getSnoozePresets } from "@/services/db/snoozePresets";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";

interface Preset {
  label: string;
  timestamp: number;
  detail?: string;
  recurring?: boolean;
}

function getBuiltinPresets(): { label: string; minutes: number }[] {
  return [
    { label: "15 Minutes", minutes: 15 },
    { label: "30 Minutes", minutes: 30 },
    { label: "1 Hour", minutes: 60 },
    { label: "2 Hours", minutes: 120 },
    { label: "4 Hours", minutes: 240 },
    { label: "8 Hours", minutes: 480 },
  ];
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface SnoozeDialogProps {
  isOpen?: boolean;
  onSnooze: (until: number) => void;
  onClose: () => void;
}

export function SnoozeDialog({
  isOpen = true,
  onSnooze,
  onClose,
}: SnoozeDialogProps) {
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [builtinPresets, setBuiltinPresets] = useState<Preset[]>([]);

  useEffect(() => {
    async function loadPresets() {
      if (!activeAccountId) return;
      const presets = await getSnoozePresets(activeAccountId);
      const now = getCurrentUnixTimestamp();
      setCustomPresets(
        presets
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => ({
            label: p.label,
            timestamp: now + p.duration_minutes * 60,
            detail: formatDuration(p.duration_minutes),
            recurring: p.is_recurring === 1,
          })),
      );
    }
    loadPresets();
  }, [activeAccountId]);

  useEffect(() => {
    const now = new Date();
    setBuiltinPresets(
      getBuiltinPresets().map((p) => {
        const ts = new Date(now.getTime() + p.minutes * 60 * 1000);
        return {
          label: p.label,
          timestamp: Math.floor(ts.getTime() / 1000),
          detail: formatDuration(p.minutes),
        };
      }),
    );
  }, []);

  const allPresets = [...customPresets, ...builtinPresets];

  return (
    <DateTimePickerDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("dialog.snoozeTitle")}
      presets={allPresets}
      onSelect={onSnooze}
      submitLabel={t("actionBar.snooze")}
    />
  );
}