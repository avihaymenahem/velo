import { getDb } from "./connection";
import type {
  AgentActionKind,
  AgentActionLevel,
  AgentActionStatus,
  RiskLevel,
} from "@/services/agentic/types";

export interface DbAgentAction {
  id: string;
  account_id: string;
  thread_id: string | null;
  message_id: string | null;
  kind: AgentActionKind;
  level: AgentActionLevel;
  status: AgentActionStatus;
  risk_level: RiskLevel;
  title: string;
  summary: string | null;
  payload_json: string;
  source_refs_json: string;
  result_json: string | null;
  error: string | null;
  created_by: string;
  reviewed_by: string | null;
  created_at: number;
  reviewed_at: number | null;
  executed_at: number | null;
  expires_at: number | null;
}

export async function createAgentAction(input: {
  id?: string;
  accountId: string;
  threadId?: string | null;
  messageId?: string | null;
  kind: AgentActionKind;
  level: AgentActionLevel;
  status: AgentActionStatus;
  riskLevel?: RiskLevel;
  title: string;
  summary?: string | null;
  payload?: unknown;
  sourceRefs?: unknown[];
  expiresAt?: number | null;
}): Promise<string> {
  const db = await getDb();
  const id = input.id ?? crypto.randomUUID();
  await db.execute(
    `INSERT INTO agent_actions (
       id, account_id, thread_id, message_id, kind, level, status, risk_level,
       title, summary, payload_json, source_refs_json, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      input.accountId,
      input.threadId ?? null,
      input.messageId ?? null,
      input.kind,
      input.level,
      input.status,
      input.riskLevel ?? "low",
      input.title,
      input.summary ?? null,
      JSON.stringify(input.payload ?? {}),
      JSON.stringify(input.sourceRefs ?? []),
      input.expiresAt ?? null,
    ],
  );
  return id;
}

export async function getPendingAgentActions(
  accountId: string,
): Promise<DbAgentAction[]> {
  const db = await getDb();
  return db.select<DbAgentAction[]>(
    `SELECT * FROM agent_actions
     WHERE account_id = $1 AND status IN ('suggested', 'prepared', 'approved')
     ORDER BY
       CASE risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       created_at DESC`,
    [accountId],
  );
}

export async function getAgentActionsForThread(
  accountId: string,
  threadId: string,
): Promise<DbAgentAction[]> {
  const db = await getDb();
  return db.select<DbAgentAction[]>(
    `SELECT * FROM agent_actions
     WHERE account_id = $1 AND thread_id = $2
     ORDER BY created_at DESC`,
    [accountId, threadId],
  );
}

export async function rejectAgentAction(
  id: string,
  reviewer: string,
  reason?: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE agent_actions SET
       status = 'rejected',
       reviewed_by = $1,
       error = $2,
       reviewed_at = unixepoch()
     WHERE id = $3`,
    [reviewer, reason ?? null, id],
  );
}
