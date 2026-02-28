import { useTranslation } from "react-i18next";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";

interface SnoozeDialogProps {
  isOpen?: boolean;
  onSnooze: (until: number) => void;
  onClose: () => void;
}

function getSnoozeTimestamps() {
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

  return {
    laterToday: Math.floor(laterToday.getTime() / 1000),
    tomorrow: Math.floor(tomorrow.getTime() / 1000),
    weekend: Math.floor(weekend.getTime() / 1000),
    nextWeek: Math.floor(nextWeek.getTime() / 1000),
  };
}

export function SnoozeDialog({ isOpen = true, onSnooze, onClose }: SnoozeDialogProps) {
  const { t } = useTranslation("email");
  const ts = getSnoozeTimestamps();
  const presets = [
    { label: t("snoozeLaterToday"), timestamp: ts.laterToday },
    { label: t("snoozeTomorrow"), timestamp: ts.tomorrow },
    { label: t("snoozeThisWeekend"), timestamp: ts.weekend },
    { label: t("snoozeNextWeek"), timestamp: ts.nextWeek },
  ];

  return (
    <DateTimePickerDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("snoozeUntil")}
      presets={presets}
      onSelect={onSnooze}
      submitLabel={t("snooze")}
    />
  );
}
