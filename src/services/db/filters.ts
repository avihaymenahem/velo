import { buildDynamicUpdate, boolToInt, queryWithRetry } from "./connection";

export type FilterOperator = 'contains' | 'matches' | 'starts_with' | 'ends_with' | 'not_contains';

export type FilterField = 'from' | 'to' | 'subject' | 'body' | 'hasAttachment';

export interface FilterCondition {
  id: string;
  filterId: string;
  field: FilterField;
  operator: FilterOperator;
  value: string;
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
}): Promise<string> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO filter_rules (id, account_id, name, is_enabled, criteria_json, actions_json) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        id,
        filter.accountId,
        filter.name,
        boolToInt(filter.isEnabled !== false),
        JSON.stringify(filter.criteria),
        JSON.stringify(filter.actions),
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
  },
): Promise<void> {
  const fields: [string, unknown][] = [];
  if (updates.name !== undefined) fields.push(["name", updates.name]);
  if (updates.criteria !== undefined) fields.push(["criteria_json", JSON.stringify(updates.criteria)]);
  if (updates.actions !== undefined) fields.push(["actions_json", JSON.stringify(updates.actions)]);
  if (updates.isEnabled !== undefined) fields.push(["is_enabled", boolToInt(updates.isEnabled)]);

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
