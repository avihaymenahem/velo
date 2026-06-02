import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { useTranslation } from "react-i18next";

interface SnoozeDialogProps {
  isOpen?: boolean;
  onSnooze: (until: number) => void;
  onClose: () => void;
}

function getSnoozePresets(labels: {
  laterToday: string;
  tomorrow: string;
  thisWeekend: string;
  nextWeek: string;
}): { label: string; timestamp: number }[] {
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
    { label: labels.laterToday, timestamp: Math.floor(laterToday.getTime() / 1000) },
    { label: labels.tomorrow, timestamp: Math.floor(tomorrow.getTime() / 1000) },
    { label: labels.thisWeekend, timestamp: Math.floor(weekend.getTime() / 1000) },
    { label: labels.nextWeek, timestamp: Math.floor(nextWeek.getTime() / 1000) },
  ];
}

export function SnoozeDialog({ isOpen = true, onSnooze, onClose }: SnoozeDialogProps) {
  const { t } = useTranslation("email");
  const presets = getSnoozePresets({
    laterToday: t("snooze.presets.laterToday"),
    tomorrow: t("snooze.presets.tomorrow"),
    thisWeekend: t("snooze.presets.thisWeekend"),
    nextWeek: t("snooze.presets.nextWeek"),
  });

  return (
    <DateTimePickerDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("snooze.title")}
      presets={presets}
      onSelect={onSnooze}
      submitLabel={t("snooze.action")}
    />
  );
}
