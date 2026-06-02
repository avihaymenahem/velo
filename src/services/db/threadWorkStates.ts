import { getDb } from "./connection";
import type { DbThread } from "./threads";
import type {
  RiskLevel,
  ThreadPrimaryState,
  WorkPriority,
  WorkStateSource,
} from "@/services/agentic/types";

export interface DbThreadWorkState {
  account_id: string;
  thread_id: string;
  primary_state: ThreadPrimaryState;
  priority: WorkPriority;
  risk_level: RiskLevel;
  source: WorkStateSource;
  confidence: number | null;
  due_at: number | null;
  waiting_since: number | null;
  last_reviewed_at: number | null;
  completed_at: number | null;
  archived_by_state_at: number | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export async function getThreadWorkState(
  accountId: string,
  threadId: string,
): Promise<DbThreadWorkState | null> {
  const db = await getDb();
  const rows = await db.select<DbThreadWorkState[]>(
    "SELECT * FROM thread_work_states WHERE account_id = $1 AND thread_id = $2",
    [accountId, threadId],
  );
  return rows[0] ?? null;
}

export async function getThreadWorkStatesForThreads(
  accountId: string,
  threadIds: string[],
): Promise<Map<string, DbThreadWorkState>> {
  if (threadIds.length === 0) return new Map();

  const db = await getDb();
  const placeholders = threadIds.map((_, i) => `$${i + 2}`).join(",");
  const rows = await db.select<DbThreadWorkState[]>(
    `SELECT * FROM thread_work_states
     WHERE account_id = $1 AND thread_id IN (${placeholders})`,
    [accountId, ...threadIds],
  );
  return new Map(rows.map((row) => [row.thread_id, row]));
}

export async function getThreadsForWorkStates(
  accountId: string,
  primaryStates: ThreadPrimaryState[],
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  if (primaryStates.length === 0) return [];

  const db = await getDb();
  const placeholders = primaryStates.map((_, i) => `$${i + 2}`).join(",");
  return db.select<DbThread[]>(
    `SELECT t.*, m.from_name, m.from_address FROM thread_work_states tws
     INNER JOIN threads t ON t.account_id = tws.account_id AND t.id = tws.thread_id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     WHERE tws.account_id = $1
       AND tws.primary_state IN (${placeholders})
       AND tws.primary_state != 'done'
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC,
       CASE tws.priority
         WHEN 'urgent' THEN 0
         WHEN 'high' THEN 1
         WHEN 'normal' THEN 2
         ELSE 3
       END,
       COALESCE(tws.due_at, 9223372036854775807) ASC,
       t.last_message_at DESC
     LIMIT $${primaryStates.length + 2} OFFSET $${primaryStates.length + 3}`,
    [accountId, ...primaryStates, limit, offset],
  );
}

export async function getDueSoonThreads(
  accountId: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  return db.select<DbThread[]>(
    `WITH due_sources AS (
       SELECT account_id, thread_id, due_at
       FROM thread_work_states
       WHERE account_id = $1
         AND due_at IS NOT NULL
         AND primary_state != 'done'
         AND due_at <= unixepoch() + 1209600
       UNION ALL
       SELECT thread_account_id AS account_id, thread_id, due_date AS due_at
       FROM tasks
       WHERE thread_account_id = $1
         AND thread_id IS NOT NULL
         AND due_date IS NOT NULL
         AND is_completed = 0
         AND due_date <= unixepoch() + 1209600
     ),
     due_threads AS (
       SELECT account_id, thread_id, MIN(due_at) AS due_at
       FROM due_sources
       GROUP BY account_id, thread_id
     )
     SELECT t.*, m.from_name, m.from_address FROM due_threads dt
     INNER JOIN threads t ON t.account_id = dt.account_id AND t.id = dt.thread_id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC, dt.due_at ASC, t.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [accountId, limit, offset],
  );
}

export async function getTodayFollowUpThreads(
  accountId: string,
  limit = 50,
  offset = 0,
): Promise<DbThread[]> {
  const db = await getDb();
  return db.select<DbThread[]>(
    `WITH follow_up_sources AS (
       SELECT account_id, thread_id,
         CASE primary_state
           WHEN 'needs_reply' THEN 0
           WHEN 'waiting' THEN 1
           ELSE 2
         END AS rank,
         due_at
       FROM thread_work_states
       WHERE account_id = $1
         AND primary_state IN ('needs_reply', 'waiting')
       UNION ALL
       SELECT account_id, thread_id, 2 AS rank, due_at
       FROM thread_work_states
       WHERE account_id = $1
         AND due_at IS NOT NULL
         AND primary_state != 'done'
         AND due_at <= unixepoch() + 1209600
       UNION ALL
       SELECT thread_account_id AS account_id, thread_id, 2 AS rank, due_date AS due_at
       FROM tasks
       WHERE thread_account_id = $1
         AND thread_id IS NOT NULL
         AND due_date IS NOT NULL
         AND is_completed = 0
         AND due_date <= unixepoch() + 1209600
     ),
     today_threads AS (
       SELECT account_id, thread_id, MIN(rank) AS rank, MIN(due_at) AS due_at
       FROM follow_up_sources
       GROUP BY account_id, thread_id
     )
     SELECT t.*, m.from_name, m.from_address FROM today_threads tt
     INNER JOIN threads t ON t.account_id = tt.account_id AND t.id = tt.thread_id
     LEFT JOIN messages m ON m.account_id = t.account_id AND m.thread_id = t.id
       AND m.date = (SELECT MAX(m2.date) FROM messages m2 WHERE m2.account_id = t.account_id AND m2.thread_id = t.id)
     GROUP BY t.account_id, t.id
     ORDER BY t.is_pinned DESC, tt.rank ASC, COALESCE(tt.due_at, 9223372036854775807) ASC, t.last_message_at DESC
     LIMIT $2 OFFSET $3`,
    [accountId, limit, offset],
  );
}

export async function upsertThreadWorkState(input: {
  accountId: string;
  threadId: string;
  primaryState: ThreadPrimaryState;
  priority?: WorkPriority;
  riskLevel?: RiskLevel;
  source?: WorkStateSource;
  confidence?: number | null;
  dueAt?: number | null;
  waitingSince?: number | null;
  note?: string | null;
}): Promise<void> {
  const source = input.source ?? "manual";
  const existing = await getThreadWorkState(input.accountId, input.threadId);

  if (existing?.source === "manual" && source === "agent_suggested") {
    return;
  }

  const db = await getDb();
  await db.execute(
    `INSERT INTO thread_work_states (
       account_id, thread_id, primary_state, priority, risk_level, source,
       confidence, due_at, waiting_since, note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(account_id, thread_id) DO UPDATE SET
       primary_state = excluded.primary_state,
       priority = excluded.priority,
       risk_level = excluded.risk_level,
       source = excluded.source,
       confidence = excluded.confidence,
       due_at = excluded.due_at,
       waiting_since = excluded.waiting_since,
       note = excluded.note,
       completed_at = CASE
         WHEN excluded.primary_state = 'done' THEN COALESCE(thread_work_states.completed_at, unixepoch())
         ELSE NULL
       END,
       updated_at = unixepoch()`,
    [
      input.accountId,
      input.threadId,
      input.primaryState,
      input.priority ?? "normal",
      input.riskLevel ?? "low",
      source,
      input.confidence ?? null,
      input.dueAt ?? null,
      input.waitingSince ?? null,
      input.note ?? null,
    ],
  );
}

export async function setThreadPrimaryState(
  accountId: string,
  threadId: string,
  primaryState: ThreadPrimaryState,
  options: {
    priority?: WorkPriority;
    riskLevel?: RiskLevel;
    dueAt?: number | null;
    waitingSince?: number | null;
    note?: string | null;
  } = {},
): Promise<void> {
  await upsertThreadWorkState({
    accountId,
    threadId,
    primaryState,
    priority: options.priority,
    riskLevel: options.riskLevel,
    dueAt: options.dueAt,
    waitingSince: options.waitingSince,
    note: options.note,
    source: "manual",
  });
}
