import { getDb } from "./connection";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

export interface DbTask {
  id: string;
  account_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
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
      `SELECT * FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND parent_id IS NULL
       ORDER BY is_completed ASC, sort_order ASC, created_at DESC`,
      [accountId],
    );
  }
  return db.select<DbTask[]>(
    `SELECT * FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND parent_id IS NULL AND is_completed = 0
     ORDER BY sort_order ASC, created_at DESC`,
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
    `SELECT * FROM tasks WHERE thread_account_id = $1 AND thread_id = $2
     ORDER BY is_completed ASC, sort_order ASC, created_at DESC`,
    [accountId, threadId],
  );
}

export async function getSubtasks(parentId: string): Promise<DbTask[]> {
  const db = await getDb();
  return db.select<DbTask[]>(
    "SELECT * FROM tasks WHERE parent_id = $1 ORDER BY sort_order ASC, created_at ASC",
    [parentId],
  );
}

export async function insertTask(task: {
  id?: string;
  accountId: string | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
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
    `INSERT INTO tasks (id, account_id, title, description, priority, due_date, parent_id, thread_id, thread_account_id, sort_order, recurrence_rule, tags_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      task.accountId,
      task.title,
      task.description ?? null,
      task.priority ?? "none",
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
    "SELECT COUNT(*) as count FROM tasks WHERE (account_id = $1 OR account_id IS NULL) AND is_completed = 0",
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
