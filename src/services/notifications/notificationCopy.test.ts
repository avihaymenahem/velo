import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import {
  formatFollowUpNotificationTitle,
  formatNewEmailBatchBody,
  formatNoSubjectNotificationBody,
  formatNotificationActionTitle,
  formatSnoozeReturnNotificationTitle,
  formatTrayTooltip,
} from "./notificationCopy";

describe("notificationCopy", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("formats notification copy in Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    expect(formatNotificationActionTitle("reply")).toBe("回复");
    expect(formatNotificationActionTitle("archive")).toBe("归档");
    expect(formatNoSubjectNotificationBody()).toBe("（无主题）");
    expect(formatNewEmailBatchBody(3)).toBe("3 封新邮件");
    expect(formatFollowUpNotificationTitle()).toBe("需要跟进");
    expect(formatSnoozeReturnNotificationTitle()).toBe("稍后提醒的邮件已返回");
    expect(formatTrayTooltip(8)).toBe("Kirje - 8 封未读");
    expect(formatTrayTooltip(0)).toBe("Kirje");
  });

  it("keeps the English notification defaults", async () => {
    await i18n.changeLanguage("en");

    expect(formatNotificationActionTitle("reply")).toBe("Reply");
    expect(formatNotificationActionTitle("archive")).toBe("Archive");
    expect(formatNoSubjectNotificationBody()).toBe("(No subject)");
    expect(formatNewEmailBatchBody(3)).toBe("3 new emails");
    expect(formatFollowUpNotificationTitle()).toBe("Follow up needed");
    expect(formatSnoozeReturnNotificationTitle()).toBe("Snoozed email returned");
    expect(formatTrayTooltip(8)).toBe("Kirje - 8 unread");
    expect(formatTrayTooltip(0)).toBe("Kirje");
  });
});
