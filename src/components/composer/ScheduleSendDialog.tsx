import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { getSchedulePresets } from "@/utils/schedulePresets";
import { t } from "@/i18n";

interface ScheduleSendDialogProps {
  onSchedule: (timestamp: number) => void;
  onClose: () => void;
}

export function ScheduleSendDialog({ onSchedule, onClose }: ScheduleSendDialogProps) {
  const presets = getSchedulePresets({
    tomorrowMorning: "composer.scheduleSend.tomorrowMorning",
    tomorrowAfternoon: "composer.scheduleSend.tomorrowAfternoon",
    mondayMorning: "composer.scheduleSend.mondayMorning",
  });

  return (
    <DateTimePickerDialog
      isOpen={true}
      onClose={onClose}
      title={t("composer.scheduleSend.title")}
      presets={presets}
      onSelect={onSchedule}
      submitLabel={t("composer.scheduleSend.submitLabel")}
      zIndex="z-[60]"
    />
  );
}
