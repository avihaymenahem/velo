import { getDb, buildDynamicUpdate } from "./connection";

export interface FilterCriteria {
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
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
}

export async function getFiltersForAccount(
  accountId: string,
): Promise<DbFilterRule[]> {
  const db = await getDb();
  return db.select<DbFilterRule[]>(
    "SELECT * FROM filter_rules WHERE account_id = $1 ORDER BY sort_order, created_at",
    [accountId],
  );
}

export async function getEnabledFiltersForAccount(
  accountId: string,
): Promise<DbFilterRule[]> {
  const db = await getDb();
  return db.select<DbFilterRule[]>(
    "SELECT * FROM filter_rules WHERE account_id = $1 AND is_enabled = 1 ORDER BY sort_order, created_at",
    [accountId],
  );
}

export async function insertFilter(filter: {
  accountId: string;
  name: string;
  criteria: FilterCriteria;
  actions: FilterActions;
  isEnabled?: boolean;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    "INSERT INTO filter_rules (id, account_id, name, is_enabled, criteria_json, actions_json) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      id,
      filter.accountId,
      filter.name,
      filter.isEnabled !== false ? 1 : 0,
      JSON.stringify(filter.criteria),
      JSON.stringify(filter.actions),
    ],
  );
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
  const db = await getDb();
  const fields: [string, unknown][] = [];
  if (updates.name !== undefined) fields.push(["name", updates.name]);
  if (updates.criteria !== undefined) fields.push(["criteria_json", JSON.stringify(updates.criteria)]);
  if (updates.actions !== undefined) fields.push(["actions_json", JSON.stringify(updates.actions)]);
  if (updates.isEnabled !== undefined) fields.push(["is_enabled", updates.isEnabled ? 1 : 0]);

  const query = buildDynamicUpdate("filter_rules", "id", id, fields);
  if (query) {
    await db.execute(query.sql, query.params);
  }
}

export async function deleteFilter(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM filter_rules WHERE id = $1", [id]);
}
