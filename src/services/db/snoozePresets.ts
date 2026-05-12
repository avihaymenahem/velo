import { queryWithRetry } from "./connection";

export interface SnoozePreset {
  id: string;
  account_id: string;
  label: string;
  duration_minutes: number;
  is_recurring: number;
  sort_order: number;
  created_at: number;
}

export async function getSnoozePresets(accountId: string): Promise<SnoozePreset[]> {
  return queryWithRetry(async (db) => {
    return db.select<SnoozePreset[]>(
      "SELECT * FROM snooze_presets WHERE account_id = $1 ORDER BY sort_order, created_at",
      [accountId],
    );
  });
}

export async function upsertSnoozePreset(preset: {
  id?: string;
  accountId: string;
  label: string;
  durationMinutes: number;
  isRecurring?: boolean;
  sortOrder?: number;
}): Promise<string> {
  const id = preset.id ?? crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      `INSERT INTO snooze_presets (id, account_id, label, duration_minutes, is_recurring, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         duration_minutes = excluded.duration_minutes,
         is_recurring = excluded.is_recurring,
         sort_order = excluded.sort_order`,
      [
        id,
        preset.accountId,
        preset.label,
        preset.durationMinutes,
        preset.isRecurring ? 1 : 0,
        preset.sortOrder ?? 0,
      ],
    );
  });
  return id;
}

export async function deleteSnoozePreset(id: string): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute("DELETE FROM snooze_presets WHERE id = $1", [id]);
  });
}