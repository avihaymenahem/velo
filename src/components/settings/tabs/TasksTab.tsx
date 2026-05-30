import { useState, useEffect } from "react";
import { getSetting, setSetting } from "@/services/db/settings";
import { Section } from "./shared";
import { t } from "@/i18n";

export function TasksTab() {
  const [taskRetentionDeleted, setTaskRetentionDeleted] = useState("7");
  const [taskAutoArchiveHours, setTaskAutoArchiveHours] = useState("24");
  const [taskRetentionCompleted, setTaskRetentionCompleted] = useState("30");

  useEffect(() => {
    async function load() {
      const taskDeleted = await getSetting("task_retention_days_deleted");
      if (taskDeleted) setTaskRetentionDeleted(taskDeleted);
      const taskArchive = await getSetting("task_auto_archive_completed_hours");
      if (taskArchive) setTaskAutoArchiveHours(taskArchive);
      const taskCompleted = await getSetting("task_retention_days_completed");
      if (taskCompleted) setTaskRetentionCompleted(taskCompleted);
    }
    load();
  }, []);

  return (
    <>
      <Section title={t("settings.tasks.sections.taskRetention")}>
        <p className="text-xs text-text-tertiary mb-4">
          {t("settings.tasks.retentionDesc")}
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-text-primary font-medium">{t("settings.tasks.deletedRetention")}</p>
              <p className="text-xs text-text-tertiary mt-0.5">{t("settings.tasks.deletedRetentionDesc")}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="365"
                value={taskRetentionDeleted}
                onChange={(e) => setTaskRetentionDeleted(e.target.value)}
                onBlur={async (e) => {
                  const v = parseInt(e.target.value, 10);
                  const val = isNaN(v) || v < 1 ? "7" : String(v);
                  setTaskRetentionDeleted(val);
                  await setSetting("task_retention_days_deleted", val);
                }}
                className="w-20 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-sm text-text-primary text-center outline-none focus:border-accent"
              />
              <span className="text-xs text-text-tertiary w-8">{t("settings.tasks.days")}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-text-primary font-medium">{t("settings.tasks.autoHideCompleted")}</p>
              <p className="text-xs text-text-tertiary mt-0.5">{t("settings.tasks.autoHideCompletedDesc")}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="8760"
                value={taskAutoArchiveHours}
                onChange={(e) => setTaskAutoArchiveHours(e.target.value)}
                onBlur={async (e) => {
                  const v = parseInt(e.target.value, 10);
                  const val = isNaN(v) || v < 0 ? "24" : String(v);
                  setTaskAutoArchiveHours(val);
                  await setSetting("task_auto_archive_completed_hours", val);
                }}
                className="w-20 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-sm text-text-primary text-center outline-none focus:border-accent"
              />
              <span className="text-xs text-text-tertiary w-8">{t("settings.tasks.hours")}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-text-primary font-medium">{t("settings.tasks.completedRetention")}</p>
              <p className="text-xs text-text-tertiary mt-0.5">{t("settings.tasks.completedRetentionDesc")}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="3650"
                value={taskRetentionCompleted}
                onChange={(e) => setTaskRetentionCompleted(e.target.value)}
                onBlur={async (e) => {
                  const v = parseInt(e.target.value, 10);
                  const val = isNaN(v) || v < 0 ? "0" : String(v);
                  setTaskRetentionCompleted(val);
                  await setSetting("task_retention_days_completed", val);
                }}
                className="w-20 bg-bg-tertiary border border-border-primary rounded-lg px-2.5 py-1.5 text-sm text-text-primary text-center outline-none focus:border-accent"
              />
              <span className="text-xs text-text-tertiary w-8">{t("settings.tasks.days")}</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("settings.tasks.sections.trashRecovery")}>
        <p className="text-xs text-text-tertiary mb-2">
          {t("settings.tasks.trashRecoveryDesc")}
        </p>
        <p className="text-xs text-text-tertiary">
          {t("settings.tasks.trashRecoveryDesc2")}
        </p>
      </Section>
    </>
  );
}
