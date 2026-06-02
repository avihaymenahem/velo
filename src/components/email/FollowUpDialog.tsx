import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";
import { useTranslation } from "react-i18next";

interface FollowUpDialogProps {
  isOpen?: boolean;
  onSetReminder: (remindAt: number) => void;
  onClose: () => void;
}

function getFollowUpPresets(t: (key: string) => string): { label: string; timestamp: number }[] {
  const now = new Date();

  const oneDay = new Date(now);
  oneDay.setDate(oneDay.getDate() + 1);
  oneDay.setHours(9, 0, 0, 0);

  const twoDays = new Date(now);
  twoDays.setDate(twoDays.getDate() + 2);
  twoDays.setHours(9, 0, 0, 0);

  const threeDays = new Date(now);
  threeDays.setDate(threeDays.getDate() + 3);
  threeDays.setHours(9, 0, 0, 0);

  const oneWeek = new Date(now);
  oneWeek.setDate(oneWeek.getDate() + 7);
  oneWeek.setHours(9, 0, 0, 0);

  return [
    { label: t("followUpDialog.presets.oneDay"), timestamp: Math.floor(oneDay.getTime() / 1000) },
    { label: t("followUpDialog.presets.twoDays"), timestamp: Math.floor(twoDays.getTime() / 1000) },
    { label: t("followUpDialog.presets.threeDays"), timestamp: Math.floor(threeDays.getTime() / 1000) },
    { label: t("followUpDialog.presets.oneWeek"), timestamp: Math.floor(oneWeek.getTime() / 1000) },
  ];
}

export function FollowUpDialog({ isOpen = true, onSetReminder, onClose }: FollowUpDialogProps) {
  const { t } = useTranslation("email");
  const presets = getFollowUpPresets(t);

  return (
    <DateTimePickerDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("followUpDialog.title")}
      presets={presets}
      onSelect={onSetReminder}
      submitLabel={t("followUpDialog.action")}
    />
  );
}
