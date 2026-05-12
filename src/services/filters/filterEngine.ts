import type { FilterCriteria, FilterCondition, FilterActions } from "../db/filters";
import { getEnabledFiltersForAccount, getFilterConditionsForRule } from "../db/filters";
import type { ParsedMessage } from "../gmail/messageParser";
import { addThreadLabel, removeThreadLabel, markThreadRead, starThread } from "../emailActions";

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

/** Eval each condition in the array using AND logic. */
function evaluateConditionsAnd(conditions: FilterCondition[], message: ParsedMessage): boolean {
  return conditions.every((c) => evaluateCondition(c, message).passed);
}

/** Eval each condition in the array using OR logic. */
function evaluateConditionsOr(conditions: FilterCondition[], message: ParsedMessage): boolean {
  return conditions.some((c) => evaluateCondition(c, message).passed);
}

/**
 * Evaluate a filter rule (from DB) against a message.
 * Uses filter_conditions rows + group_operator if available,
 * falls back to legacy criteria_json.
 */
export async function evaluateFilterRule(
  rule: { id: string; group_operator?: string | null; criteria_json?: string },
  message: ParsedMessage,
  criteria?: FilterCriteria,
  conditions?: FilterCondition[],
): Promise<boolean> {
  if (!conditions) {
    conditions = await getFilterConditionsForRule(rule.id);
  }

  if (conditions.length > 0) {
    const operator = (rule.group_operator as "AND" | "OR" | undefined) ?? "AND";
    return operator === "AND"
      ? evaluateConditionsAnd(conditions, message)
      : evaluateConditionsOr(conditions, message);
  }

  // Fall back to legacy criteria
  const crit = criteria ?? (() => {
    if (!rule.criteria_json) return {};
    try { return JSON.parse(rule.criteria_json) as FilterCriteria; } catch { return {}; }
  })();
  return messageMatchesFilter(message, crit);
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
      const matches = await evaluateFilterRule(rule, msg, criteria, conditions);
      if (matches) {
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
