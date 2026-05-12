import { queryWithRetry } from "./connection";

export interface DbWorkflowRule {
  id: string;
  account_id: string;
  name: string;
  trigger_event: string;
  trigger_conditions: string | null;
  actions: string;
  is_active: number;
  created_at: number;
}

export async function getWorkflowRules(accountId: string): Promise<DbWorkflowRule[]> {
  return queryWithRetry(async (db) =>
    db.select<DbWorkflowRule[]>(
      "SELECT * FROM workflow_rules WHERE account_id = $1 ORDER BY created_at",
      [accountId],
    ),
  );
}

export async function getActiveWorkflowRules(accountId: string, event: string): Promise<DbWorkflowRule[]> {
  return queryWithRetry(async (db) =>
    db.select<DbWorkflowRule[]>(
      "SELECT * FROM workflow_rules WHERE account_id = $1 AND trigger_event = $2 AND is_active = 1 ORDER BY created_at",
      [accountId, event],
    ),
  );
}

export async function upsertWorkflowRule(rule: {
  id?: string;
  accountId: string;
  name: string;
  triggerEvent: string;
  triggerConditions?: string;
  actions: string;
}): Promise<string> {
  const id = rule.id ?? crypto.randomUUID();
  await queryWithRetry(async (db) => {
    if (rule.id) {
      await db.execute(
        "UPDATE workflow_rules SET name = $1, trigger_event = $2, trigger_conditions = $3, actions = $4 WHERE id = $5",
        [rule.name, rule.triggerEvent, rule.triggerConditions ?? null, rule.actions, rule.id],
      );
    } else {
      await db.execute(
        "INSERT INTO workflow_rules (id, account_id, name, trigger_event, trigger_conditions, actions) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, rule.accountId, rule.name, rule.triggerEvent, rule.triggerConditions ?? null, rule.actions],
      );
    }
  });

  return id;
}

export async function deleteWorkflowRule(id: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute("DELETE FROM workflow_rules WHERE id = $1", [id]),
  );
}

export async function toggleWorkflowRule(id: string, isActive: boolean): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute("UPDATE workflow_rules SET is_active = $1 WHERE id = $2", [isActive ? 1 : 0, id]),
  );
}
