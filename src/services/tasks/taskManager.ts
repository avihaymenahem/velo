import { completeTask, insertTask, getTaskById, updateTask, purgeOldDeletedTasks as dbPurge } from "@/services/db/tasks";

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
 * Purge tasks soft-deleted more than 7 days ago.
 * Call once at startup and optionally on a daily interval.
 */
export async function purgeOldDeletedTasks(): Promise<void> {
  try {
    await dbPurge();
  } catch (err) {
    console.warn("[taskManager] purgeOldDeletedTasks failed:", err);
  }
}
