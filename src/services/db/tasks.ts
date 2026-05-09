import { getDb } from "./connection";

/** Extended view of DbTask with the thread subject joined from the threads table. */
export interface DbTaskWithSubject extends DbTask {
  thread_subject: string | null;
}

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type TaskDirection = "incoming" | "outgoing";

export interface DbTask {
  id: string;
  account_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  direction: TaskDirection;
  is_completed: number;
  completed_at: number | null;
  due_date: number | null;
  parent_id: string | null;
  thread_id: string | null;
  thread_account_id: string | null;
  sort_order: number;
  recurrence_rule: string | null;
  next_recurrence_at: number | null;
  tags_json: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface DbTaskTag {
  tag: string;
  account_id: string | null;
  color: string | null;
  sort_order: number;
  created_at: number;
}

export async function getTasksForAccount(
  accountId: string | null,
  includeCompleted = false,
): Promise<DbTask[]> {
  const db = await getDb();
  if (includeCompleted) {
    return db.select<DbTask[]>(
      `SELECT * FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND parent_id IS NULL AND deleted_at IS NULL
       ORDER BY is_completed ASC, sort_order ASC, created_at DESC`,
      [accountId],
    );
  }
  return db.select<DbTask[]>(
    `SELECT * FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND parent_id IS NULL AND is_completed = 0 AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at DESC`,
    [accountId],
  );
}

export async function getTasksByDirection(
  accountId: string | null,
  direction: TaskDirection,
  includeCompleted = false,
): Promise<DbTask[]> {
  const db = await getDb();
  if (includeCompleted) {
    return db.select<DbTask[]>(
      `SELECT * FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND parent_id IS NULL AND direction = $2 AND deleted_at IS NULL
       ORDER BY is_completed ASC, sort_order ASC, created_at DESC`,
      [accountId, direction],
    );
  }
  return db.select<DbTask[]>(
    `SELECT * FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND parent_id IS NULL AND direction = $2 AND is_completed = 0 AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at DESC`,
    [accountId, direction],
  );
}

/**
 * Load all active tasks for an account, joined with their thread subject.
 * Sorted so that threads containing at least one overdue incomplete task appear first,
 * then chronologically by nearest due_date (NULLs last).
 */
export async function getTasksWithSubjects(
  accountId: string | null,
  includeCompleted = false,
): Promise<DbTaskWithSubject[]> {
  const db = await getDb();
  const completedFilter = includeCompleted ? "" : "AND t.is_completed = 0";
  return db.select<DbTaskWithSubject[]>(
    `SELECT t.*, th.subject AS thread_subject
     FROM tasks t
     LEFT JOIN threads th ON th.account_id = t.thread_account_id AND th.id = t.thread_id
     WHERE (t.account_id = $1 OR t.account_id IS NULL)
       AND t.parent_id IS NULL
       AND t.deleted_at IS NULL
       ${completedFilter}
     ORDER BY
       -- Overdue group first: threads with at least one overdue incomplete task
       CASE WHEN t.thread_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM tasks t2
         WHERE t2.thread_id = t.thread_id
           AND t2.is_completed = 0
           AND t2.due_date IS NOT NULL
           AND t2.due_date < unixepoch()
           AND t2.deleted_at IS NULL
       ) THEN 0 ELSE 1 END ASC,
       -- Within group: nearest due_date first, NULLs last
       CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC,
       t.due_date ASC,
       t.created_at DESC`,
    [accountId],
  );
}

export async function getTaskById(id: string): Promise<DbTask | null> {
  const db = await getDb();
  const rows = await db.select<DbTask[]>(
    "SELECT * FROM tasks WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function getTasksForThread(
  accountId: string,
  threadId: string,
): Promise<DbTask[]> {
  const db = await getDb();
  return db.select<DbTask[]>(
    `SELECT * FROM tasks WHERE thread_account_id = $1 AND thread_id = $2 AND deleted_at IS NULL
     ORDER BY is_completed ASC, sort_order ASC, created_at DESC`,
    [accountId, threadId],
  );
}

export async function getSubtasks(parentId: string): Promise<DbTask[]> {
  const db = await getDb();
  return db.select<DbTask[]>(
    "SELECT * FROM tasks WHERE parent_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC",
    [parentId],
  );
}

export async function insertTask(task: {
  id?: string;
  accountId: string | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  direction?: TaskDirection;
  dueDate?: number | null;
  parentId?: string | null;
  threadId?: string | null;
  threadAccountId?: string | null;
  sortOrder?: number;
  recurrenceRule?: string | null;
  tagsJson?: string;
}): Promise<string> {
  const db = await getDb();
  const id = task.id ?? crypto.randomUUID();
  await db.execute(
    `INSERT INTO tasks (id, account_id, title, description, priority, direction, due_date, parent_id, thread_id, thread_account_id, sort_order, recurrence_rule, tags_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      task.accountId,
      task.title,
      task.description ?? null,
      task.priority ?? "none",
      task.direction ?? "outgoing",
      task.dueDate ?? null,
      task.parentId ?? null,
      task.threadId ?? null,
      task.threadAccountId ?? null,
      task.sortOrder ?? 0,
      task.recurrenceRule ?? null,
      task.tagsJson ?? "[]",
    ],
  );
  return id;
}

export async function updateTask(
  id: string,
  updates: {
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    direction?: TaskDirection;
    dueDate?: number | null;
    sortOrder?: number;
    recurrenceRule?: string | null;
    nextRecurrenceAt?: number | null;
    tagsJson?: string;
  },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = ["updated_at = unixepoch()"];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.title !== undefined) {
    sets.push(`title = $${idx++}`);
    params.push(updates.title);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(updates.description);
  }
  if (updates.priority !== undefined) {
    sets.push(`priority = $${idx++}`);
    params.push(updates.priority);
  }
  if (updates.direction !== undefined) {
    sets.push(`direction = $${idx++}`);
    params.push(updates.direction);
  }
  if (updates.dueDate !== undefined) {
    sets.push(`due_date = $${idx++}`);
    params.push(updates.dueDate);
  }
  if (updates.sortOrder !== undefined) {
    sets.push(`sort_order = $${idx++}`);
    params.push(updates.sortOrder);
  }
  if (updates.recurrenceRule !== undefined) {
    sets.push(`recurrence_rule = $${idx++}`);
    params.push(updates.recurrenceRule);
  }
  if (updates.nextRecurrenceAt !== undefined) {
    sets.push(`next_recurrence_at = $${idx++}`);
    params.push(updates.nextRecurrenceAt);
  }
  if (updates.tagsJson !== undefined) {
    sets.push(`tags_json = $${idx++}`);
    params.push(updates.tagsJson);
  }

  params.push(id);
  await db.execute(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx}`,
    params,
  );
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

export async function softDeleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET deleted_at = unixepoch(), updated_at = unixepoch() WHERE id = $1",
    [id],
  );
}

export async function softDeleteTasksByThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET deleted_at = unixepoch(), updated_at = unixepoch() WHERE thread_account_id = $1 AND thread_id = $2 AND deleted_at IS NULL",
    [accountId, threadId],
  );
}

export async function restoreTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET deleted_at = NULL, updated_at = unixepoch() WHERE id = $1",
    [id],
  );
}

export async function purgeOldDeletedTasks(): Promise<void> {
  const db = await getDb();
  // Hard-delete records soft-deleted more than 7 days ago
  await db.execute(
    "DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < (unixepoch() - 604800)",
  );
}

export async function completeTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET is_completed = 1, completed_at = unixepoch(), updated_at = unixepoch() WHERE id = $1",
    [id],
  );
}

export async function uncompleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET is_completed = 0, completed_at = NULL, updated_at = unixepoch() WHERE id = $1",
    [id],
  );
}

export async function reorderTasks(
  taskIds: string[],
): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < taskIds.length; i++) {
    await db.execute(
      "UPDATE tasks SET sort_order = $1, updated_at = unixepoch() WHERE id = $2",
      [i, taskIds[i]],
    );
  }
}

export async function getIncompleteTaskCount(
  accountId: string | null,
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND is_completed = 0 AND deleted_at IS NULL",
    [accountId],
  );
  return rows[0]?.count ?? 0;
}

export async function getTaskTags(
  accountId: string | null,
): Promise<DbTaskTag[]> {
  const db = await getDb();
  return db.select<DbTaskTag[]>(
    "SELECT * FROM task_tags WHERE account_id = $1 OR account_id IS NULL ORDER BY sort_order ASC",
    [accountId],
  );
}

export async function upsertTaskTag(
  tag: string,
  accountId: string | null,
  color?: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO task_tags (tag, account_id, color)
     VALUES ($1, $2, $3)
     ON CONFLICT(tag, account_id) DO UPDATE SET color = $3`,
    [tag, accountId, color ?? null],
  );
}

export async function deleteTaskTag(
  tag: string,
  accountId: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM task_tags WHERE tag = $1 AND account_id = $2",
    [tag, accountId],
  );
}
