import type { FilterCriteria, FilterActions } from "../db/filters";
import { getEnabledFiltersForAccount } from "../db/filters";
import type { ParsedMessage } from "../gmail/messageParser";
import type { GmailClient } from "../gmail/client";
import { getDb } from "../db/connection";

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
  client: GmailClient,
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

  // Apply combined actions per thread
  const db = await getDb();
  for (const [threadId, result] of threadActions) {
    const addLabels = [...new Set(result.addLabelIds)];
    const removeLabels = [...new Set(result.removeLabelIds)];

    try {
      // Apply label changes via Gmail API
      if (addLabels.length > 0 || removeLabels.length > 0) {
        await client.modifyThread(
          threadId,
          addLabels.length > 0 ? addLabels : undefined,
          removeLabels.length > 0 ? removeLabels : undefined,
        );
      }

      // Mark as read locally + via API
      if (result.markRead) {
        await client.modifyThread(threadId, undefined, ["UNREAD"]);
        await db.execute(
          "UPDATE threads SET is_read = 1 WHERE account_id = $1 AND id = $2",
          [accountId, threadId],
        );
      }

      // Star locally
      if (result.star) {
        await db.execute(
          "UPDATE threads SET is_starred = 1 WHERE account_id = $1 AND id = $2",
          [accountId, threadId],
        );
      }
    } catch (err) {
      console.error(`Failed to apply filter actions to thread ${threadId}:`, err);
    }
  }
}
