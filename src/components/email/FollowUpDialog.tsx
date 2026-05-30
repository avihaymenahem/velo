import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { t } from "@/i18n";

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
    { label: t("email.followUp.in1Day"), timestamp: Math.floor(oneDay.getTime() / 1000) },
    { label: t("email.followUp.in2Days"), timestamp: Math.floor(twoDays.getTime() / 1000) },
    { label: t("email.followUp.in3Days"), timestamp: Math.floor(threeDays.getTime() / 1000) },
    { label: t("email.followUp.in1Week"), timestamp: Math.floor(oneWeek.getTime() / 1000) },
  ];
}

export function FollowUpDialog({ isOpen = true, onSetReminder, onClose }: FollowUpDialogProps) {
  const presets = getFollowUpPresets();

  return (
    <DateTimePickerDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("email.followUp.title")}
      presets={presets}
      onSelect={onSetReminder}
      submitLabel={t("email.followUp.submitLabel")}
    />
  );
}
