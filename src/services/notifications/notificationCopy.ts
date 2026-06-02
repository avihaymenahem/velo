import i18n from "@/i18n";

type NotificationAction = "reply" | "archive";

export function formatNotificationActionTitle(action: NotificationAction): string {
  return i18n.t(`common:notifications.actions.${action}`);
}

export function formatNoSubjectNotificationBody(): string {
  return i18n.t("common:notifications.noSubject");
}

export function formatNewEmailBatchBody(count: number): string {
  return i18n.t("common:notifications.newEmails", { count });
}

export function formatFollowUpNotificationTitle(): string {
  return i18n.t("common:notifications.followUpNeeded");
}

export function formatSnoozeReturnNotificationTitle(): string {
  return i18n.t("common:notifications.snoozedEmailReturned");
}

export function formatTrayTooltip(count: number): string {
  if (count <= 0) return "Kirje";
  return i18n.t("common:tray.unreadTooltip", { count });
}
