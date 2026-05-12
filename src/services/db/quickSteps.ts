import { queryWithRetry, buildDynamicUpdate, boolToInt } from "./connection";
import type { QuickStepAction } from "../quickSteps/types";

export interface DbQuickStep {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  shortcut: string | null;
  actions_json: string;
  icon: string | null;
  is_enabled: number;
  continue_on_error: number;
  sort_order: number;
  created_at: number;
}

export async function getQuickStepsForAccount(
  accountId: string,
): Promise<DbQuickStep[]> {
  return queryWithRetry(async (db) =>
    db.select<DbQuickStep[]>(
      "SELECT * FROM quick_steps WHERE account_id = $1 ORDER BY sort_order, created_at",
      [accountId],
    ),
  );
}

export async function getEnabledQuickStepsForAccount(
  accountId: string,
): Promise<DbQuickStep[]> {
  return queryWithRetry(async (db) =>
    db.select<DbQuickStep[]>(
      "SELECT * FROM quick_steps WHERE account_id = $1 AND is_enabled = 1 ORDER BY sort_order, created_at",
      [accountId],
    ),
  );
}

export async function insertQuickStep(step: {
  accountId: string;
  name: string;
  description?: string;
  shortcut?: string;
  actions: QuickStepAction[];
  icon?: string;
  isEnabled?: boolean;
  continueOnError?: boolean;
}): Promise<string> {
  return queryWithRetry(async (db) => {
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO quick_steps (id, account_id, name, description, shortcut, actions_json, icon, is_enabled, continue_on_error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        id,
        step.accountId,
        step.name,
        step.description ?? null,
        step.shortcut ?? null,
        JSON.stringify(step.actions),
        step.icon ?? null,
        boolToInt(step.isEnabled !== false),
        boolToInt(step.continueOnError),
      ],
    );
    return id;
  });
}

export async function updateQuickStep(
  id: string,
  updates: {
    name?: string;
    description?: string;
    shortcut?: string | null;
    actions?: QuickStepAction[];
    icon?: string;
    isEnabled?: boolean;
    continueOnError?: boolean;
  },
): Promise<void> {
  return queryWithRetry(async (db) => {
    const fields: [string, unknown][] = [];
    if (updates.name !== undefined) fields.push(["name", updates.name]);
    if (updates.description !== undefined) fields.push(["description", updates.description]);
    if (updates.shortcut !== undefined) fields.push(["shortcut", updates.shortcut]);
    if (updates.actions !== undefined) fields.push(["actions_json", JSON.stringify(updates.actions)]);
    if (updates.icon !== undefined) fields.push(["icon", updates.icon]);
    if (updates.isEnabled !== undefined) fields.push(["is_enabled", boolToInt(updates.isEnabled)]);
    if (updates.continueOnError !== undefined) fields.push(["continue_on_error", boolToInt(updates.continueOnError)]);

    const query = buildDynamicUpdate("quick_steps", "id", id, fields);
    if (query) {
      await db.execute(query.sql, query.params);
    }
  });
}

export async function deleteQuickStep(id: string): Promise<void> {
  await queryWithRetry(async (db) =>
    db.execute("DELETE FROM quick_steps WHERE id = $1", [id]),
  );
}

export async function reorderQuickSteps(
  accountId: string,
  orderedIds: string[],
): Promise<void> {
  return queryWithRetry(async (db) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute(
        "UPDATE quick_steps SET sort_order = $1 WHERE id = $2 AND account_id = $3",
        [i, orderedIds[i], accountId],
      );
    }
  });
}
