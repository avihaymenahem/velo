import { getEnabledSmartLabelRules } from "@/services/db/smartLabelRules";
import { messageMatchesFilter } from "@/services/filters/filterEngine";
import { classifyThreadsBySmartLabels } from "@/services/ai/aiService";
import type { FilterCriteria } from "@/services/db/filters";
import type { ParsedMessage } from "@/services/gmail/messageParser";

export interface SmartLabelMatch {
  threadId: string;
  labelIds: string[];
}

/**
 * Match messages against smart label rules using two-phase matching:
 * 1. Fast path: traditional filter criteria (deterministic)
 * 2. AI path: batch remaining unmatched threads to AI
 */
export async function matchSmartLabels(
  accountId: string,
  messages: ParsedMessage[],
): Promise<SmartLabelMatch[]> {
  const rules = await getEnabledSmartLabelRules(accountId);
  if (rules.length === 0) return [];

  // Deduplicate threads — use first message per thread for matching
  const threadMap = new Map<string, ParsedMessage>();
  for (const msg of messages) {
    if (!threadMap.has(msg.threadId)) {
      threadMap.set(msg.threadId, msg);
    }
  }

  // Phase 1: Fast path — check criteria for rules that have them
  const criteriaMatches = new Map<string, Set<string>>(); // threadId → labelIds
  const rulesWithCriteria: { labelId: string; criteria: FilterCriteria }[] = [];
  const allRulesForAi: { labelId: string; description: string }[] = [];

  for (const rule of rules) {
    allRulesForAi.push({ labelId: rule.label_id, description: rule.ai_description });

    if (rule.criteria_json) {
      try {
        const criteria = JSON.parse(rule.criteria_json) as FilterCriteria;
        if (Object.keys(criteria).length > 0) {
          rulesWithCriteria.push({ labelId: rule.label_id, criteria });
        }
      } catch {
        // Invalid criteria JSON, skip fast path for this rule
      }
    }
  }

  // Track which threadId+labelId combos were matched by criteria
  const criteriaMatchedPairs = new Set<string>();

  for (const [threadId, msg] of threadMap) {
    for (const { labelId, criteria } of rulesWithCriteria) {
      if (messageMatchesFilter(msg, criteria)) {
        const existing = criteriaMatches.get(threadId) ?? new Set();
        existing.add(labelId);
        criteriaMatches.set(threadId, existing);
        criteriaMatchedPairs.add(`${threadId}:${labelId}`);
      }
    }
  }

  // Phase 2: AI path — classify threads that weren't fully matched by criteria
  // Send all threads to AI for labels that didn't match via criteria
  const threadsForAi: { id: string; subject: string; snippet: string; fromAddress: string }[] = [];
  for (const [threadId, msg] of threadMap) {
    // Include thread if any label rule hasn't been matched by criteria for this thread
    const matchedLabels = criteriaMatches.get(threadId);
    const allLabelsMatched = allRulesForAi.every(
      (r) => matchedLabels?.has(r.labelId),
    );
    if (!allLabelsMatched) {
      threadsForAi.push({
        id: threadId,
        subject: msg.subject ?? "",
        snippet: msg.snippet,
        fromAddress: msg.fromAddress ?? "",
      });
    }
  }

  if (threadsForAi.length > 0 && allRulesForAi.length > 0) {
    try {
      const aiResults = await classifyThreadsBySmartLabels(threadsForAi, allRulesForAi);

      // Merge AI results (skip pairs already matched by criteria)
      for (const [threadId, labelIds] of aiResults) {
        const existing = criteriaMatches.get(threadId) ?? new Set();
        for (const labelId of labelIds) {
          if (!criteriaMatchedPairs.has(`${threadId}:${labelId}`)) {
            existing.add(labelId);
          }
        }
        if (existing.size > 0) {
          criteriaMatches.set(threadId, existing);
        }
      }
    } catch (err) {
      console.error("Smart label AI classification failed:", err);
      // Continue with criteria-only matches
    }
  }

  // Convert to result array
  const results: SmartLabelMatch[] = [];
  for (const [threadId, labelIds] of criteriaMatches) {
    results.push({ threadId, labelIds: [...labelIds] });
  }

  return results;
}
