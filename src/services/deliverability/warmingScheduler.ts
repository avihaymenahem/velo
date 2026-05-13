import { getDb } from "@/services/db/connection";
import { bumpDailyVolume } from "./warmingService";

export async function checkWarmingUpdates(): Promise<void> {
  const db = await getDb();
  const accounts = await db.select<{ account_id: string }[]>(
    "SELECT account_id FROM email_warming WHERE enabled = 1",
  );

  for (const { account_id } of accounts) {
    try {
      await bumpDailyVolume(account_id);
    } catch (err) {
      console.error(`Warming update failed for account ${account_id}:`, err);
    }
  }
}

let warmingInterval: ReturnType<typeof setInterval> | null = null;

export function startWarmingScheduler(intervalMs: number = 86400000): void {
  if (warmingInterval) return;
  checkWarmingUpdates();
  warmingInterval = setInterval(checkWarmingUpdates, intervalMs);
}

export function stopWarmingScheduler(): void {
  if (warmingInterval) {
    clearInterval(warmingInterval);
    warmingInterval = null;
  }
}
