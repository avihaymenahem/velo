import { queryWithRetry } from "@/services/db/connection";
import type { WorkflowAction } from "./workflowEngine";

export interface TimeBasedRule {
  id: string;
  accountId: string;
  name: string;
  schedule: string;
  actions: WorkflowAction[];
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

function parseCronExpression(cron: string): { minute: number; hour: number; dayOfWeek: number } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const minute = parts[0] === "*" ? -1 : Number(parts[0]);
  const hour = parts[1] === "*" ? -1 : Number(parts[1]);
  const dayOfWeek = parts[4] === "*" ? -1 : Number(parts[4]);

  if (isNaN(minute) || isNaN(hour) || isNaN(dayOfWeek)) return null;

  return { minute, hour, dayOfWeek };
}

function cronMatches(cron: string, now: Date): boolean {
  const parsed = parseCronExpression(cron);
  if (!parsed) return false;

  if (parsed.minute >= 0 && parsed.minute !== now.getMinutes()) return false;
  if (parsed.hour >= 0 && parsed.hour !== now.getHours()) return false;
  if (parsed.dayOfWeek >= 0 && parsed.dayOfWeek !== now.getDay()) return false;

  return true;
}

export function startWorkflowScheduler(): () => void {
  stopWorkflowScheduler();

  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();
      const rules = await queryWithRetry(async (db) =>
        db.select<{
          id: string;
          account_id: string;
          name: string;
          trigger_event: string;
          trigger_conditions: string | null;
          actions: string;
          is_active: number;
          created_at: number;
        }[]>(
          "SELECT * FROM workflow_rules WHERE trigger_event = 'time_based' AND is_active = 1",
        ),
      );

      for (const rule of rules) {
        if (!rule.trigger_conditions) continue;

        try {
          const conditions = JSON.parse(rule.trigger_conditions) as { cron?: string };
          if (conditions.cron && cronMatches(conditions.cron, now)) {
            const { evaluateAndExecute } = await import("./workflowEngine");
            await evaluateAndExecute(rule, { accountId: rule.account_id });
          }
        } catch {
          // skip invalid rules
        }
      }
    } catch {
      // silent fail on scheduler tick
    }
  }, 60_000);

  return stopWorkflowScheduler;
}

export function stopWorkflowScheduler(): void {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
