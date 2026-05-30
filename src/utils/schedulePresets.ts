import { t } from "@/i18n";

function formatPresetDate(date: Date): string {
  return (
    date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export function getSchedulePresets(labelKeys: {
  tomorrowMorning: string;
  tomorrowAfternoon: string;
  mondayMorning: string;
}): { label: string; detail: string; timestamp: number }[] {
  const now = new Date();

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  const tomorrowAfternoon = new Date(now);
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
  tomorrowAfternoon.setHours(13, 0, 0, 0);

  const monday = new Date(now);
  const daysUntilMonday = (1 - monday.getDay() + 7) % 7 || 7;
  monday.setDate(monday.getDate() + daysUntilMonday);
  monday.setHours(9, 0, 0, 0);

  return [
    {
      label: t(labelKeys.tomorrowMorning),
      detail: formatPresetDate(tomorrowMorning),
      timestamp: Math.floor(tomorrowMorning.getTime() / 1000),
    },
    {
      label: t(labelKeys.tomorrowAfternoon),
      detail: formatPresetDate(tomorrowAfternoon),
      timestamp: Math.floor(tomorrowAfternoon.getTime() / 1000),
    },
    {
      label: t(labelKeys.mondayMorning),
      detail: formatPresetDate(monday),
      timestamp: Math.floor(monday.getTime() / 1000),
    },
  ];
}
