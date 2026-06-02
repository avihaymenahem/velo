import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { useTranslation } from "react-i18next";

interface ScheduleSendDialogProps {
  onSchedule: (timestamp: number) => void;
  onClose: () => void;
}

export function getSchedulePresets(labels: {
  tomorrowMorning: string;
  tomorrowAfternoon: string;
  mondayMorning: string;
}, locale: string): { label: string; detail: string; timestamp: number }[] {
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
      label: labels.tomorrowMorning,
      detail: formatPresetDetail(tomorrowMorning, locale),
      timestamp: Math.floor(tomorrowMorning.getTime() / 1000),
    },
    {
      label: labels.tomorrowAfternoon,
      detail: formatPresetDetail(tomorrowAfternoon, locale),
      timestamp: Math.floor(tomorrowAfternoon.getTime() / 1000),
    },
    {
      label: labels.mondayMorning,
      detail: formatPresetDetail(monday, locale),
      timestamp: Math.floor(monday.getTime() / 1000),
    },
  ];
}

function formatPresetDetail(date: Date, locale: string): string {
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${datePart} ${timePart}`;
}

export function ScheduleSendDialog({ onSchedule, onClose }: ScheduleSendDialogProps) {
  const { t, i18n } = useTranslation("composer");
  const presets = getSchedulePresets({
    tomorrowMorning: t("schedule.presets.tomorrowMorning"),
    tomorrowAfternoon: t("schedule.presets.tomorrowAfternoon"),
    mondayMorning: t("schedule.presets.mondayMorning"),
  }, i18n.resolvedLanguage ?? i18n.language);

  return (
    <DateTimePickerDialog
      isOpen={true}
      onClose={onClose}
      title={t("schedule.title")}
      presets={presets}
      onSelect={onSchedule}
      submitLabel={t("schedule.action")}
      zIndex="z-[60]"
    />
  );
}
