import { completeTask, insertTask, getTaskById, updateTask, purgeOldDeletedTasks as dbPurge, purgeOldCompletedTasks as dbPurgeCompleted } from "@/services/db/tasks";
import { getSetting } from "@/services/db/settings";

export interface RecurrenceRule {
  type: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  daysOfWeek?: number[];
}

export function parseRecurrenceRule(json: string | null): RecurrenceRule | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as RecurrenceRule;
  } catch {
    return null;
  }
}

export function calculateNextOccurrence(
  fromDate: Date,
  rule: RecurrenceRule,
): Date {
  const next = new Date(fromDate);

  switch (rule.type) {
    case "daily":
      next.setDate(next.getDate() + rule.interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * rule.interval);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + rule.interval);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + rule.interval);
      break;
  }

  return next;
}

export async function handleRecurringTaskCompletion(
  taskId: string,
): Promise<string | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;

  await completeTask(taskId);

  const rule = parseRecurrenceRule(task.recurrence_rule);
  if (!rule) return null;

  const fromDate = task.due_date ? new Date(task.due_date * 1000) : new Date();
  const nextDate = calculateNextOccurrence(fromDate, rule);
  const nextDueDate = Math.floor(nextDate.getTime() / 1000);

  const newId = await insertTask({
    accountId: task.account_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    direction: task.direction,
    dueDate: nextDueDate,
    parentId: task.parent_id,
    threadId: task.thread_id,
    threadAccountId: task.thread_account_id,
    sortOrder: task.sort_order,
    recurrenceRule: task.recurrence_rule,
    tagsJson: task.tags_json,
  });

  await updateTask(newId, { nextRecurrenceAt: nextDueDate });

  return newId;
}

/**
 * Purge soft-deleted tasks using the configured retention period.
 * Reads `task_retention_days_deleted` from settings (default: 7 days).
 */
export async function purgeOldDeletedTasks(): Promise<void> {
  try {
    const raw = await getSetting("task_retention_days_deleted");
    const days = raw ? parseInt(raw, 10) : 7;
    await dbPurge(isNaN(days) || days <= 0 ? 7 : days);
  } catch (err) {
    console.warn("[taskManager] purgeOldDeletedTasks failed:", err);
  }
}

/**
 * Permanently delete completed tasks older than `task_retention_days_completed` days.
 * No-ops if the setting is unset or ≤ 0 (user opted out).
 */
export async function purgeOldCompletedTasks(): Promise<void> {
  try {
    const raw = await getSetting("task_retention_days_completed");
    if (!raw) return;
    const days = parseInt(raw, 10);
    if (isNaN(days) || days <= 0) return;
    await dbPurgeCompleted(days);
  } catch (err) {
    console.warn("[taskManager] purgeOldCompletedTasks failed:", err);
  }
}
