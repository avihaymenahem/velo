import { getDb, buildDynamicUpdate, boolToInt } from "./connection";
import type { FilterCriteria } from "./filters";

export interface DbSmartLabelRule {
  id: string;
  account_id: string;
  label_id: string;
  ai_description: string;
  criteria_json: string | null;
  is_enabled: number;
  sort_order: number;
  created_at: number;
}

export async function getSmartLabelRulesForAccount(
  accountId: string,
): Promise<DbSmartLabelRule[]> {
  const db = await getDb();
  return db.select<DbSmartLabelRule[]>(
    "SELECT * FROM smart_label_rules WHERE account_id = $1 ORDER BY sort_order, created_at",
    [accountId],
  );
}

export async function getEnabledSmartLabelRules(
  accountId: string,
): Promise<DbSmartLabelRule[]> {
  const db = await getDb();
  return db.select<DbSmartLabelRule[]>(
    "SELECT * FROM smart_label_rules WHERE account_id = $1 AND is_enabled = 1 ORDER BY sort_order, created_at",
    [accountId],
  );
}

export async function insertSmartLabelRule(rule: {
  accountId: string;
  labelId: string;
  aiDescription: string;
  criteria?: FilterCriteria;
  isEnabled?: boolean;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT INTO smart_label_rules (id, account_id, label_id, ai_description, criteria_json, is_enabled) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      id,
      rule.accountId,
      rule.labelId,
      rule.aiDescription,
      rule.criteria ? JSON.stringify(rule.criteria) : null,
      boolToInt(rule.isEnabled !== false),
    ],
  );
  return id;
}

export async function updateSmartLabelRule(
  id: string,
  updates: {
    labelId?: string;
    aiDescription?: string;
    criteria?: FilterCriteria | null;
    isEnabled?: boolean;
  },
): Promise<void> {
  const db = await getDb();
  const fields: [string, unknown][] = [];
  if (updates.labelId !== undefined) fields.push(["label_id", updates.labelId]);
  if (updates.aiDescription !== undefined) fields.push(["ai_description", updates.aiDescription]);
  if (updates.criteria !== undefined)
    fields.push(["criteria_json", updates.criteria ? JSON.stringify(updates.criteria) : null]);
  if (updates.isEnabled !== undefined) fields.push(["is_enabled", boolToInt(updates.isEnabled)]);

  const query = buildDynamicUpdate("smart_label_rules", "id", id, fields);
  if (query) {
    await db.execute(query.sql, query.params);
  }
}

export async function deleteSmartLabelRule(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM smart_label_rules WHERE id = $1", [id]);
}
