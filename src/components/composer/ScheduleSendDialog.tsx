import { useTranslation } from "react-i18next";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";

interface ScheduleSendDialogProps {
  onSchedule: (timestamp: number) => void;
  onClose: () => void;
}

function getScheduleTimestamps() {
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

  return { tomorrowMorning, tomorrowAfternoon, monday };
}

export function ScheduleSendDialog({ onSchedule, onClose }: ScheduleSendDialogProps) {
  const { t } = useTranslation("composer");
  const { tomorrowMorning, tomorrowAfternoon, monday } = getScheduleTimestamps();

  const presets = [
    {
      label: t("tomorrowMorning"),
      detail: tomorrowMorning.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " 9:00 AM",
      timestamp: Math.floor(tomorrowMorning.getTime() / 1000),
    },
    {
      label: t("tomorrowAfternoon"),
      detail: tomorrowAfternoon.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " 1:00 PM",
      timestamp: Math.floor(tomorrowAfternoon.getTime() / 1000),
    },
    {
      label: t("mondayMorning"),
      detail: monday.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " 9:00 AM",
      timestamp: Math.floor(monday.getTime() / 1000),
    },
  ];

  return (
    <DateTimePickerDialog
      isOpen={true}
      onClose={onClose}
      title={t("scheduleSend")}
      presets={presets}
      onSelect={onSchedule}
      submitLabel={t("schedule")}
      zIndex="z-[60]"
    />
  );
}
