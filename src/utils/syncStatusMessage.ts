import type { TFunction } from "i18next";
import type { SyncProgress } from "@/services/gmail/sync";

export interface SyncStatusView {
  text: string;
  isError: boolean;
}

export function buildSyncStatusView(
  t: TFunction<"common">,
  status: "syncing" | "done" | "error",
  progress?: SyncProgress,
  error?: string,
): SyncStatusView {
  if (status === "syncing") {
    if (progress?.phase === "messages") {
      return {
        text: t("syncStatus.messages", {
          current: progress.current,
          total: progress.total,
        }),
        isError: false,
      };
    }
    if (progress?.phase === "labels") {
      return { text: t("syncStatus.labels"), isError: false };
    }
    if (progress?.phase === "threads") {
      return {
        text: t("syncStatus.threads", {
          current: progress.current,
          total: progress.total,
        }),
        isError: false,
      };
    }
    return { text: t("syncStatus.syncing"), isError: false };
  }

  if (status === "done") {
    return { text: t("syncStatus.complete"), isError: false };
  }

  return {
    text: error
      ? t("syncStatus.failedWithReason", { error })
      : t("syncStatus.failed"),
    isError: true,
  };
}
