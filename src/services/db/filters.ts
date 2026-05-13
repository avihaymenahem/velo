import { buildDynamicUpdate, boolToInt, queryWithRetry } from "./connection";

export type FilterOperator = 'contains' | 'matches' | 'starts_with' | 'ends_with' | 'not_contains';

export type FilterField = 'from' | 'to' | 'subject' | 'body' | 'hasAttachment';

export interface FilterCondition {
  id: string;
  filterId: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
  weight?: number;
}

export interface FilterGroup {
  id: string;
  ruleId: string;
  operator: 'AND' | 'OR';
  parentGroupId?: string;
}

export interface FilterConditionInput {
  field: FilterField;
  operator: FilterOperator;
  value: string;
  weight?: number;
}

export interface FilterCriteria {
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
  conditions?: FilterConditionInput[];
  matchType?: "all" | "any";
}

export interface FilterActions {
  applyLabel?: string;
  archive?: boolean;
  star?: boolean;
  markRead?: boolean;
  trash?: boolean;
}

export interface DbFilterRule {
  id: string;
  account_id: string;
  name: string;
  is_enabled: number;
  criteria_json: string;
  actions_json: string;
  sort_order: number;
  created_at: number;
  group_operator?: string;
  score_threshold?: number;
  chaining_action?: string;
}

export interface FilterLog {
  id: string;
  rule_id: string;
  message_id: string;
  matched: number;
  score: number;
  applied_actions: string;
  created_at: number;
}

export interface FilterStats {
  matchCount: number;
  topRules: { ruleId: string; ruleName: string; matchCount: number }[];
  zeroMatchRules: { ruleId: string; ruleName: string }[];
}

export async function getFiltersForAccount(
  accountId: string,
): Promise<DbFilterRule[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbFilterRule[]>(
      "SELECT * FROM filter_rules WHERE account_id = $1 ORDER BY sort_order, created_at",
      [accountId],
    );
  });
}

export async function getEnabledFiltersForAccount(
  accountId: string,
): Promise<DbFilterRule[]> {
  return queryWithRetry(async (db) => {
    return db.select<DbFilterRule[]>(
      "SELECT * FROM filter_rules WHERE account_id = $1 AND is_enabled = 1 ORDER BY sort_order, created_at",
      [accountId],
    );
  });
}

export async function insertFilter(filter: {
  accountId: string;
  name: string;
  criteria: FilterCriteria;
  actions: FilterActions;
  isEnabled?: boolean;
  scoreThreshold?: number;
  chainingAction?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO filter_rules (id, account_id, name, is_enabled, criteria_json, actions_json, score_threshold, chaining_action) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        id,
        filter.accountId,
        filter.name,
        boolToInt(filter.isEnabled !== false),
        JSON.stringify(filter.criteria),
        JSON.stringify(filter.actions),
        filter.scoreThreshold ?? null,
        filter.chainingAction ?? 'stop',
      ],
    );
  });
  return id;
}

export async function updateFilter(
  id: string,
  updates: {
    name?: string;
    criteria?: FilterCriteria;
    actions?: FilterActions;
    isEnabled?: boolean;
    scoreThreshold?: number | null;
    chainingAction?: string;
  },
): Promise<void> {
  const fields: [string, unknown][] = [];
  if (updates.name !== undefined) fields.push(["name", updates.name]);
  if (updates.criteria !== undefined) fields.push(["criteria_json", JSON.stringify(updates.criteria)]);
  if (updates.actions !== undefined) fields.push(["actions_json", JSON.stringify(updates.actions)]);
  if (updates.isEnabled !== undefined) fields.push(["is_enabled", boolToInt(updates.isEnabled)]);
  if (updates.scoreThreshold !== undefined) fields.push(["score_threshold", updates.scoreThreshold]);
  if (updates.chainingAction !== undefined) fields.push(["chaining_action", updates.chainingAction]);

  await queryWithRetry(async (db) => {
    const query = buildDynamicUpdate("filter_rules", "id", id, fields);
    if (query) {
      await db.execute(query.sql, query.params);
    }
  });
}

export async function deleteFilter(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute("DELETE FROM filter_rules WHERE id = $1", [id]);
  });
}

export async function getFilterRuleById(id: string): Promise<DbFilterRule | null> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<DbFilterRule[]>(
      "SELECT * FROM filter_rules WHERE id = $1",
      [id],
    );
    return rows[0] ?? null;
  });
}

export async function getFilterGroups(ruleId: string): Promise<FilterGroup[]> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<Pick<DbFilterRule, 'group_operator'>[]>(
      "SELECT group_operator FROM filter_rules WHERE id = $1",
      [ruleId],
    );
    if (rows.length === 0) return [];
    return [{
      id: ruleId,
      ruleId,
      operator: (rows[0]!.group_operator as 'AND' | 'OR') ?? 'AND',
    }];
  });
}

export async function upsertFilterGroup(group: FilterGroup): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE filter_rules SET group_operator = $1 WHERE id = $2",
      [group.operator, group.ruleId],
    );
  });
}

export async function deleteFilterGroup(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute("DELETE FROM filter_conditions WHERE filter_id = $1", [id]);
  });
}

export async function getFilterConditions(groupId: string): Promise<FilterCondition[]> {
  return queryWithRetry(async (db) => {
    return db.select<FilterCondition[]>(
      `SELECT id, filter_id AS filterId, field, operator, value
       FROM filter_conditions WHERE filter_id = $1 ORDER BY rowid`,
      [groupId],
    );
  });
}

export async function getFilterConditionsForRule(ruleId: string): Promise<FilterCondition[]> {
  return getFilterConditions(ruleId);
}

export async function upsertFilterCondition(condition: FilterCondition): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      `INSERT OR REPLACE INTO filter_conditions (id, filter_id, field, operator, value)
       VALUES ($1, $2, $3, $4, $5)`,
      [condition.id, condition.filterId, condition.field, condition.operator, condition.value],
    );
  });
}

export async function deleteFilterCondition(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute("DELETE FROM filter_conditions WHERE id = $1", [id]);
  });
}

export async function getFilterLogs(
  ruleId: string,
  limit: number = 50,
): Promise<FilterLog[]> {
  return queryWithRetry(async (db) => {
    return db.select<FilterLog[]>(
      `SELECT fl.id, fl.rule_id, fl.message_id, fl.matched, fl.score,
              fl.applied_actions, fl.created_at
       FROM filter_logs fl
       WHERE fl.rule_id = $1
       ORDER BY fl.created_at DESC
       LIMIT $2`,
      [ruleId, limit],
    );
  });
}

export async function logFilterMatch(
  ruleId: string,
  messageId: string,
  matched: boolean,
  score: number,
  actions: FilterActions,
): Promise<void> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO filter_logs (id, rule_id, message_id, matched, score, applied_actions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, ruleId, messageId, matched ? 1 : 0, score, JSON.stringify(actions)],
    );
  });
}

export async function getFilterStats(accountId: string): Promise<FilterStats> {
  return queryWithRetry(async (db) => {
    const matchCountRow = await db.select<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM filter_logs fl
       JOIN filter_rules fr ON fr.id = fl.rule_id
       WHERE fr.account_id = $1 AND fl.matched = 1`,
      [accountId],
    );

    const topRules = await db.select<{ ruleId: string; ruleName: string; matchCount: number }[]>(
      `SELECT fr.id as ruleId, fr.name as ruleName, COUNT(*) as matchCount
       FROM filter_logs fl
       JOIN filter_rules fr ON fr.id = fl.rule_id
       WHERE fr.account_id = $1 AND fl.matched = 1
       GROUP BY fr.id
       ORDER BY matchCount DESC
       LIMIT 10`,
      [accountId],
    );

    const zeroMatchRules = await db.select<{ ruleId: string; ruleName: string }[]>(
      `SELECT fr.id as ruleId, fr.name as ruleName
       FROM filter_rules fr
       WHERE fr.account_id = $1 AND fr.is_enabled = 1
         AND NOT EXISTS (
           SELECT 1 FROM filter_logs fl
           WHERE fl.rule_id = fr.id AND fl.matched = 1
         )
       ORDER BY fr.name`,
      [accountId],
    );

    return {
      matchCount: matchCountRow[0]?.count ?? 0,
      topRules,
      zeroMatchRules,
    };
  });
}
