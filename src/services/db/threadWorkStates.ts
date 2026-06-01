import { getDb } from "./connection";
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
