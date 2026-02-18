import { completeTask, insertTask, getTaskById, updateTask } from "@/services/db/tasks";

export interface RecurrenceRule {
  type: "daily" | "weekly" | "monthly" | "yearly";
  interval: number; // every N days/weeks/months/years
  daysOfWeek?: number[]; // 0=Sun - 6=Sat, for weekly
}

/**
 * Parse a recurrence rule from its JSON string.
 */
export function parseRecurrenceRule(json: string | null): RecurrenceRule | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as RecurrenceRule;
  } catch {
    return null;
  }
}

/**
 * Calculate the next occurrence date from a given start date and recurrence rule.
 */
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

/**
 * Handle task completion when the task has a recurrence rule.
 * Completes the current task and creates a new one for the next occurrence.
 * Returns the new task ID if a recurring task was created, null otherwise.
 */
export async function handleRecurringTaskCompletion(
  taskId: string,
): Promise<string | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;

  // Complete the current task
  await completeTask(taskId);

  // Check for recurrence
  const rule = parseRecurrenceRule(task.recurrence_rule);
  if (!rule) return null;

  // Calculate next due date
  const fromDate = task.due_date ? new Date(task.due_date * 1000) : new Date();
  const nextDate = calculateNextOccurrence(fromDate, rule);
  const nextDueDate = Math.floor(nextDate.getTime() / 1000);

  // Create the next occurrence
  const newId = await insertTask({
    accountId: task.account_id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: nextDueDate,
    parentId: task.parent_id,
    threadId: task.thread_id,
    threadAccountId: task.thread_account_id,
    sortOrder: task.sort_order,
    recurrenceRule: task.recurrence_rule,
    tagsJson: task.tags_json,
  });

  // Update next_recurrence_at on the new task
  await updateTask(newId, { nextRecurrenceAt: nextDueDate });

  return newId;
}
