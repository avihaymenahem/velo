import { getWarmingPlan as dbGetWarmingPlan, upsertWarmingPlan, logWarmingVolume } from "@/services/db/warming";

export interface WarmingPlan {
  id: string;
  accountId: string;
  enabled: boolean;
  startVolume: number;
  currentVolume: number;
  targetVolume: number;
  rampDays: number;
  createdAt: number;
  updatedAt: number;
}

export interface WarmingProgress {
  currentVolume: number;
  targetVolume: number;
  startVolume: number;
  day: number;
  totalDays: number;
  percentageComplete: number;
}

function mapPlan(row: { id: string; account_id: string; enabled: number; start_volume: number; current_volume: number; target_volume: number; ramp_days: number; created_at: number; updated_at: number }): WarmingPlan {
  return {
    id: row.id,
    accountId: row.account_id,
    enabled: row.enabled === 1,
    startVolume: row.start_volume,
    currentVolume: row.current_volume,
    targetVolume: row.target_volume,
    rampDays: row.ramp_days,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWarmingPlan(accountId: string): Promise<WarmingPlan | null> {
  const row = await dbGetWarmingPlan(accountId);
  return row ? mapPlan(row) : null;
}

export async function enableWarming(accountId: string): Promise<void> {
  const existing = await getWarmingPlan(accountId);
  if (existing) {
    await upsertWarmingPlan(accountId, { enabled: 1 as unknown as number });
  } else {
    await upsertWarmingPlan(accountId, {
      enabled: 1 as unknown as number,
      start_volume: 10,
      current_volume: 10,
      target_volume: 100,
      ramp_days: 14,
    });
  }
}

export async function disableWarming(accountId: string): Promise<void> {
  await upsertWarmingPlan(accountId, { enabled: 0 as unknown as number });
}

export async function getDailyLimit(accountId: string): Promise<number> {
  const plan = await getWarmingPlan(accountId);
  if (!plan || !plan.enabled) return Infinity;
  return plan.currentVolume;
}

export async function logSentVolume(accountId: string, count: number): Promise<void> {
  await logWarmingVolume(accountId, count);
}

export async function getWarmingProgress(accountId: string): Promise<WarmingProgress | null> {
  const plan = await getWarmingPlan(accountId);
  if (!plan) return null;

  const startDate = plan.createdAt;
  const daysElapsed = Math.floor((Date.now() / 1000 - startDate) / 86400);
  const day = Math.min(daysElapsed + 1, plan.rampDays);
  const totalDays = plan.rampDays;
  const percentageComplete = Math.min(100, (daysElapsed / plan.rampDays) * 100);

  return {
    currentVolume: plan.currentVolume,
    targetVolume: plan.targetVolume,
    startVolume: plan.startVolume,
    day,
    totalDays,
    percentageComplete: Math.round(percentageComplete * 100) / 100,
  };
}

function computeVolume(start: number, target: number, daysElapsed: number, rampDays: number): number {
  const t = Math.min(1, daysElapsed / rampDays);
  return Math.round(start + (target - start) * t);
}

export async function bumpDailyVolume(accountId: string): Promise<void> {
  const plan = await getWarmingPlan(accountId);
  if (!plan || !plan.enabled) return;

  const startDate = plan.createdAt;
  const daysElapsed = Math.floor((Date.now() / 1000 - startDate) / 86400);
  const newVolume = computeVolume(plan.startVolume, plan.targetVolume, daysElapsed, plan.rampDays);

  await upsertWarmingPlan(accountId, {
    current_volume: newVolume,
    updated_at: Math.floor(Date.now() / 1000),
  } as unknown as Record<string, unknown>);
  await logWarmingVolume(accountId, newVolume);
}
