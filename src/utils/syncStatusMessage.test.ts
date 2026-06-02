import i18n from "@/i18n";
import { buildSyncStatusView } from "./syncStatusMessage";

describe("buildSyncStatusView", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("formats syncing progress in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const t = i18n.getFixedT("zh-CN", "common");

    expect(buildSyncStatusView(t, "syncing")).toEqual({
      text: "正在同步...",
      isError: false,
    });
    expect(buildSyncStatusView(t, "syncing", { phase: "messages", current: 3, total: 9 })).toEqual({
      text: "正在同步：3/9 封邮件",
      isError: false,
    });
    expect(buildSyncStatusView(t, "syncing", { phase: "labels", current: 1, total: 2 })).toEqual({
      text: "正在同步标签...",
      isError: false,
    });
    expect(buildSyncStatusView(t, "syncing", { phase: "threads", current: 4, total: 8 })).toEqual({
      text: "正在构建线程...（4/8）",
      isError: false,
    });
  });

  it("formats completion and error states in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const t = i18n.getFixedT("zh-CN", "common");

    expect(buildSyncStatusView(t, "done")).toEqual({
      text: "同步完成",
      isError: false,
    });
    expect(buildSyncStatusView(t, "error")).toEqual({
      text: "同步失败",
      isError: true,
    });
    expect(buildSyncStatusView(t, "error", undefined, "网络超时")).toEqual({
      text: "同步失败：网络超时",
      isError: true,
    });
  });

  it("keeps English defaults", () => {
    const t = i18n.getFixedT("en", "common");

    expect(buildSyncStatusView(t, "syncing", { phase: "messages", current: 3, total: 9 })).toEqual({
      text: "Syncing: 3/9 messages",
      isError: false,
    });
    expect(buildSyncStatusView(t, "done")).toEqual({
      text: "Sync complete",
      isError: false,
    });
    expect(buildSyncStatusView(t, "error", undefined, "Network timeout")).toEqual({
      text: "Sync failed: Network timeout",
      isError: true,
    });
  });
});
