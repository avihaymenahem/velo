import { useTranslation } from "react-i18next";
import { DateTimePickerDialog } from "@/components/ui/DateTimePickerDialog";

interface FollowUpDialogProps {
  isOpen?: boolean;
  onSetReminder: (remindAt: number) => void;
  onClose: () => void;
}

function getFollowUpTimestamps() {
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

  return {
    oneDay: Math.floor(oneDay.getTime() / 1000),
    twoDays: Math.floor(twoDays.getTime() / 1000),
    threeDays: Math.floor(threeDays.getTime() / 1000),
    oneWeek: Math.floor(oneWeek.getTime() / 1000),
  };
}

export function FollowUpDialog({ isOpen = true, onSetReminder, onClose }: FollowUpDialogProps) {
  const { t } = useTranslation("email");
  const ts = getFollowUpTimestamps();
  const presets = [
    { label: t("followUpIn1Day"), timestamp: ts.oneDay },
    { label: t("followUpIn2Days"), timestamp: ts.twoDays },
    { label: t("followUpIn3Days"), timestamp: ts.threeDays },
    { label: t("followUpIn1Week"), timestamp: ts.oneWeek },
  ];

  return (
    <DateTimePickerDialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("followUpTitle")}
      presets={presets}
      onSelect={onSetReminder}
      submitLabel={t("setReminder")}
    />
  );
}
