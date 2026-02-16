import type { FilterCriteria, FilterActions } from "../db/filters";
import { getEnabledFiltersForAccount } from "../db/filters";
import type { ParsedMessage } from "../gmail/messageParser";
import { addThreadLabel, removeThreadLabel, markThreadRead, starThread } from "../emailActions";

/**
 * Check if a parsed message matches the given filter criteria.
 * All set criteria must match (AND logic). Matching is case-insensitive substring.
 */
export function messageMatchesFilter(
  message: ParsedMessage,
  criteria: FilterCriteria,
): boolean {
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

  // Group actions by threadId so we can batch modifications
  const threadActions = new Map<string, FilterResult>();

  for (const msg of messages) {
    for (const filter of filters) {
      let criteria: FilterCriteria;
      let actions: FilterActions;
      try {
        criteria = JSON.parse(filter.criteria_json) as FilterCriteria;
        actions = JSON.parse(filter.actions_json) as FilterActions;
      } catch {
        continue;
      }

      if (messageMatchesFilter(msg, criteria)) {
        const result = computeFilterActions(actions);
        const existing = threadActions.get(msg.threadId);
        if (existing) {
          // Merge results
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

  // Apply combined actions per thread in parallel
  await Promise.allSettled(
    [...threadActions].map(async ([threadId, result]) => {
      const addLabels = [...new Set(result.addLabelIds)];
      const removeLabels = [...new Set(result.removeLabelIds)];

      try {
        // Apply label changes via provider
        for (const labelId of addLabels) {
          await addThreadLabel(accountId, threadId, labelId);
        }
        for (const labelId of removeLabels) {
          await removeThreadLabel(accountId, threadId, labelId);
        }

        // Mark as read via provider
        if (result.markRead) {
          await markThreadRead(accountId, threadId, [], true);
        }

        // Star via provider
        if (result.star) {
          await starThread(accountId, threadId, [], true);
        }
      } catch (err) {
        console.error(`Failed to apply filter actions to thread ${threadId}:`, err);
      }
    }),
  );
}
