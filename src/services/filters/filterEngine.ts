import type { FilterCriteria, FilterCondition, FilterActions } from "../db/filters";
import {
  getEnabledFiltersForAccount,
  getFilterConditionsForRule,
  logFilterMatch,
} from "../db/filters";
import type { ParsedMessage } from "../gmail/messageParser";
import { addThreadLabel, removeThreadLabel, markThreadRead, starThread } from "../emailActions";

export interface ScoredCondition extends FilterCondition {
  weight: number;
}

export type ChainingAction = "stop" | "continue" | "continue_on_match" | "continue_on_no_match";

export function evaluateCondition(
  condition: FilterCondition,
  message: ParsedMessage,
): { passed: boolean; matchedText: string | null } {
  let fieldValue: string;

  switch (condition.field) {
    case "from":
      fieldValue = `${message.fromName ?? ""} ${message.fromAddress ?? ""}`.trim();
      break;
    case "to":
      fieldValue = message.toAddresses ?? "";
      break;
    case "subject":
      fieldValue = message.subject ?? "";
      break;
    case "body":
      fieldValue = `${message.bodyText ?? ""} ${message.bodyHtml ?? ""}`;
      break;
    case "hasAttachment": {
      const hasIt = message.hasAttachments ?? false;
      const condVal = condition.value.trim().toLowerCase();
      const expectedTrue = condVal === "true" || condVal === "1";
      return { passed: hasIt === expectedTrue, matchedText: String(hasIt) };
    }
    default:
      return { passed: false, matchedText: null };
  }

  const lowerField = fieldValue.toLowerCase();
  const lowerCondValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case "contains": {
      const idx = lowerField.indexOf(lowerCondValue);
      if (idx !== -1) {
        return { passed: true, matchedText: fieldValue.slice(idx, idx + condition.value.length) ?? null };
      }
      return { passed: false, matchedText: null };
    }
    case "not_contains": {
      const idx = lowerField.indexOf(lowerCondValue);
      if (idx === -1) {
        return { passed: true, matchedText: null };
      }
      return { passed: false, matchedText: fieldValue.slice(idx, idx + condition.value.length) ?? null };
    }
    case "matches": {
      try {
        const regex = new RegExp(condition.value, "i");
        const match = fieldValue.match(regex);
        if (match && match[0]) {
          return { passed: true, matchedText: match[0] };
        }
      } catch {
        // Invalid regex — treat as no match
      }
      return { passed: false, matchedText: null };
    }
    case "starts_with": {
      if (lowerField.startsWith(lowerCondValue)) {
        return { passed: true, matchedText: fieldValue.slice(0, condition.value.length) ?? null };
      }
      return { passed: false, matchedText: null };
    }
    case "ends_with": {
      if (lowerField.endsWith(lowerCondValue)) {
        return { passed: true, matchedText: fieldValue.slice(fieldValue.length - condition.value.length) ?? null };
      }
      return { passed: false, matchedText: null };
    }
    default:
      return { passed: false, matchedText: null };
  }
}

/**
 * Evaluate a scored rule: sum(weight * match_bool) across conditions.
 * Returns both whether the rule matched and the computed score.
 */
export function evaluateScoredConditions(
  conditions: ScoredCondition[],
  message: ParsedMessage,
  operator: "AND" | "OR" = "AND",
): { matched: boolean; score: number } {
  let totalScore = 0;
  let anyMatched = false;
  let allMatched = true;

  for (const cond of conditions) {
    const weight = cond.weight ?? 1.0;
    const result = evaluateCondition(cond, message);
    if (result.passed) {
      totalScore += weight;
      anyMatched = true;
    } else {
      allMatched = false;
    }
  }

  if (operator === "OR") {
    return { matched: anyMatched, score: totalScore };
  }
  return { matched: allMatched, score: totalScore };
}

/**
 * Evaluate a filter rule with scoring support.
 * Returns { matched, score } where score is the weighted sum.
 * When score_threshold is set on the rule, the rule only matches if score >= threshold.
 */
export async function evaluateFilterRule(
  rule: { id: string; group_operator?: string | null; criteria_json?: string; score_threshold?: number | null },
  message: ParsedMessage,
  criteria?: FilterCriteria,
  conditions?: FilterCondition[],
): Promise<{ matched: boolean; score: number }> {
  if (!conditions) {
    conditions = await getFilterConditionsForRule(rule.id);
  }

  if (conditions.length > 0) {
    const operator = (rule.group_operator as "AND" | "OR" | undefined) ?? "AND";
    const scoredConditions: ScoredCondition[] = conditions.map((c) => ({
      ...c,
      weight: (c as ScoredCondition).weight ?? 1.0,
    }));
    const result = evaluateScoredConditions(scoredConditions, message, operator);
    if (rule.score_threshold != null) {
      return { matched: result.score >= rule.score_threshold, score: result.score };
    }
    return result;
  }

  // Fall back to legacy criteria
  const crit = criteria ?? (() => {
    if (!rule.criteria_json) return {};
    try { return JSON.parse(rule.criteria_json) as FilterCriteria; } catch { return {}; }
  })();
  const legacyMatched = messageMatchesFilter(message, crit);
  return { matched: legacyMatched, score: legacyMatched ? 1 : 0 };
}

/**
 * Evaluate a chain of filter rules against a message, respecting each rule's chaining_action.
 * Returns the list of rules that matched, in evaluation order.
 */
export async function evaluateChainedRules(
  rules: {
    id: string;
    group_operator?: string | null;
    criteria_json?: string;
    score_threshold?: number | null;
    chaining_action?: string | null;
  }[],
  message: ParsedMessage,
): Promise<{ ruleId: string; matched: boolean; score: number }[]> {
  const results: { ruleId: string; matched: boolean; score: number }[] = [];

  for (const rule of rules) {
    const conditions = await getFilterConditionsForRule(rule.id);
    const { matched, score } = await evaluateFilterRule(rule, message, undefined, conditions);
    results.push({ ruleId: rule.id, matched, score });

    const chainAction = (rule.chaining_action as ChainingAction) ?? "stop";

    if (chainAction === "stop") {
      break;
    } else if (chainAction === "continue") {
      // always continue to next
    } else if (chainAction === "continue_on_match") {
      if (!matched) break;
    } else if (chainAction === "continue_on_no_match") {
      if (matched) break;
    }
  }

  return results;
}

/**
 * Check if a parsed message matches the given filter criteria.
 * Supports both legacy flat criteria (AND logic, case-insensitive substring)
 * and new conditions-based format.
 */
export function messageMatchesFilter(
  message: ParsedMessage,
  criteria: FilterCriteria,
): boolean {
  // New conditions-based format (via criteria_json)
  if (criteria.conditions && criteria.conditions.length > 0) {
    const matchType = criteria.matchType ?? "all";
    const fieldSources: Record<string, string> = {
      from: `${message.fromName ?? ""} ${message.fromAddress ?? ""}`.toLowerCase(),
      to: (message.toAddresses ?? "").toLowerCase(),
      subject: (message.subject ?? "").toLowerCase(),
      body: `${message.bodyText ?? ""} ${message.bodyHtml ?? ""}`.toLowerCase(),
    };

    for (const condition of criteria.conditions) {
      const searchStr = fieldSources[condition.field] ?? "";
      const condValue = condition.value.toLowerCase();
      let matches = false;

      switch (condition.operator) {
        case "contains":
          matches = searchStr.includes(condValue);
          break;
        case "starts_with":
          matches = searchStr.startsWith(condValue);
          break;
        case "ends_with":
          matches = searchStr.endsWith(condValue);
          break;
        case "matches":
          try { matches = new RegExp(condition.value, "i").test(searchStr); } catch { matches = false; }
          break;
        case "not_contains":
          matches = !searchStr.includes(condValue);
          break;
      }

      if (matchType === "all" && !matches) return false;
      if (matchType === "any" && matches) return true;
    }

    return matchType === "all";
  }

  // Legacy flat fields (backward compatible)
  if (criteria.from) {
    const fromStr = `${message.fromName ?? ""} ${message.fromAddress ?? ""}`.toLowerCase();
    if (!fromStr.includes(criteria.from.toLowerCase())) return false;
  }

  if (criteria.to) {
    const toStr = (message.toAddresses ?? "").toLowerCase();
    if (!toStr.includes(criteria.to.toLowerCase())) return false;
  }

  if (criteria.subject) {
    const subjectStr = (message.subject ?? "").toLowerCase();
    if (!subjectStr.includes(criteria.subject.toLowerCase())) return false;
  }

  if (criteria.body) {
    const bodyStr = `${message.bodyText ?? ""} ${message.bodyHtml ?? ""}`.toLowerCase();
    if (!bodyStr.includes(criteria.body.toLowerCase())) return false;
  }

  if (criteria.hasAttachment) {
    if (!message.hasAttachments) return false;
  }

  return true;
}

export interface FilterResult {
  addLabelIds: string[];
  removeLabelIds: string[];
  markRead: boolean;
  star: boolean;
}

/**
 * Compute the aggregate label/flag changes from a set of filter actions.
 */
export function computeFilterActions(actions: FilterActions): FilterResult {
  const addLabelIds: string[] = [];
  const removeLabelIds: string[] = [];

  if (actions.applyLabel) {
    addLabelIds.push(actions.applyLabel);
  }

  if (actions.archive) {
    removeLabelIds.push("INBOX");
  }

  if (actions.trash) {
    addLabelIds.push("TRASH");
    removeLabelIds.push("INBOX");
  }

  if (actions.star) {
    addLabelIds.push("STARRED");
  }

  return {
    addLabelIds,
    removeLabelIds,
    markRead: actions.markRead ?? false,
    star: actions.star ?? false,
  };
}

/**
 * Apply all enabled filters to a set of new messages for the given account.
 * Modifies threads via the Gmail API and updates local DB.
 * Supports v2 features: scoring, chaining, and logging.
 */
export async function applyFiltersToMessages(
  accountId: string,
  messages: ParsedMessage[],
): Promise<void> {
  const filters = await getEnabledFiltersForAccount(accountId);
  if (filters.length === 0) return;

  const parsedFilters = await Promise.all(
    filters.map(async (filter) => {
      try {
        const conditions = await getFilterConditionsForRule(filter.id);
        return [{
          rule: filter,
          criteria: JSON.parse(filter.criteria_json) as FilterCriteria,
          actions: JSON.parse(filter.actions_json) as FilterActions,
          conditions,
        }];
      } catch {
        return [];
      }
    }),
  );
  const flatParsed = parsedFilters.flat();
  if (flatParsed.length === 0) return;

  const threadActions = new Map<string, FilterResult>();

  for (const msg of messages) {
    for (const { rule, criteria, actions, conditions } of flatParsed) {
      const { matched, score } = await evaluateFilterRule(rule, msg, criteria, conditions);

      await logFilterMatch(rule.id, msg.id, matched, score, actions).catch(() => {});

      if (matched) {
        const result = computeFilterActions(actions);
        const existing = threadActions.get(msg.threadId);
        if (existing) {
          existing.addLabelIds.push(...result.addLabelIds);
          existing.removeLabelIds.push(...result.removeLabelIds);
          existing.markRead = existing.markRead || result.markRead;
          existing.star = existing.star || result.star;
        } else {
          threadActions.set(msg.threadId, result);
        }
      }

      const chainAction = (rule.chaining_action as ChainingAction) ?? "stop";
      if (chainAction === "stop" || (chainAction === "continue_on_match" && !matched) || (chainAction === "continue_on_no_match" && matched)) {
        break;
      }
    }
  }

  await Promise.allSettled(
    [...threadActions].map(async ([threadId, result]) => {
      const addLabels = [...new Set(result.addLabelIds)];
      const removeLabels = [...new Set(result.removeLabelIds)];

      try {
        for (const labelId of addLabels) {
          await addThreadLabel(accountId, threadId, labelId);
        }
        for (const labelId of removeLabels) {
          await removeThreadLabel(accountId, threadId, labelId);
        }

        if (result.markRead) {
          await markThreadRead(accountId, threadId, [], true);
        }

        if (result.star) {
          await starThread(accountId, threadId, [], true);
        }
      } catch (err) {
        console.error(`Failed to apply filter actions to thread ${threadId}:`, err);
      }
    }),
  );
}
