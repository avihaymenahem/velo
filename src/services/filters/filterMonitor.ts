import { queryWithRetry } from "../db/connection";
import { getFilterStats, getFilterRuleById } from "../db/filters";
import type { FilterLog } from "../db/filters";

export interface FilterDashboard {
  matchRate24h: number;
  matchRate7d: number;
  topRules: { ruleId: string; ruleName: string; matchCount: number }[];
  zeroMatchRules: { ruleId: string; ruleName: string }[];
  recentLogs: (FilterLog & { ruleName: string })[];
}

export async function getFilterDashboard(accountId: string): Promise<FilterDashboard> {
  const stats = await getFilterStats(accountId);

  const allLogs = await getFilterLogsForAccount(accountId, 50);
  const now = Date.now() / 1000;
  const oneDayAgo = now - 86400;
  const sevenDaysAgo = now - 604800;

  const logs24h = allLogs.filter((l) => l.created_at >= oneDayAgo);
  const logs7d = allLogs.filter((l) => l.created_at >= sevenDaysAgo);

  const matchRate24h = logs24h.length > 0
    ? logs24h.filter((l) => l.matched === 1).length / logs24h.length
    : 0;
  const matchRate7d = logs7d.length > 0
    ? logs7d.filter((l) => l.matched === 1).length / logs7d.length
    : 0;

  const recentLogs = await enrichLogsWithRuleNames(allLogs.slice(0, 20));

  return {
    matchRate24h,
    matchRate7d,
    topRules: stats.topRules,
    zeroMatchRules: stats.zeroMatchRules,
    recentLogs,
  };
}

async function getFilterLogsForAccount(
  accountId: string,
  limit: number,
): Promise<FilterLog[]> {
  return queryWithRetry(async (db) => {
    return db.select<FilterLog[]>(
      `SELECT fl.id, fl.rule_id, fl.message_id, fl.matched, fl.score,
              fl.applied_actions, fl.created_at
       FROM filter_logs fl
       JOIN filter_rules fr ON fr.id = fl.rule_id
       WHERE fr.account_id = $1
       ORDER BY fl.created_at DESC
       LIMIT $2`,
      [accountId, limit],
    );
  });
}

async function enrichLogsWithRuleNames(
  logs: FilterLog[],
): Promise<(FilterLog & { ruleName: string })[]> {
  const ruleCache = new Map<string, string>();
  return Promise.all(
    logs.map(async (log) => {
      if (!ruleCache.has(log.rule_id)) {
        const rule = await getFilterRuleById(log.rule_id);
        ruleCache.set(log.rule_id, rule?.name ?? "Unknown");
      }
      return { ...log, ruleName: ruleCache.get(log.rule_id)! };
    }),
  );
}
