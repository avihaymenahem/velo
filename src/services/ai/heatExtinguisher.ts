import { getSetting } from "@/services/db/settings";
import { setHeatExtinguished, setManualUrgencyOverride } from "@/services/db/threads";
import { useThreadStore } from "@/stores/threadStore";
import { logInteraction } from "./reputationEngine";
import { getMessagesForThread } from "@/services/db/messages";

// ---------------------------------------------------------------------------
// Extinguish — marks a thread as resolved (heat = 0)
// ---------------------------------------------------------------------------

export async function extinguishThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  await setHeatExtinguished(accountId, threadId, true);
  useThreadStore.getState().updateThread(threadId, { isHeatExtinguished: true });
}

// ---------------------------------------------------------------------------
// Mute urgency — zeroes urgency, logs MUTE_URGENCY for reputation tracking
// ---------------------------------------------------------------------------

export async function muteUrgency(
  accountId: string,
  threadId: string,
  fromAddress: string,
): Promise<void> {
  await setManualUrgencyOverride(accountId, threadId, 1);
  await logInteraction(accountId, fromAddress, "MUTE_URGENCY", threadId);
  useThreadStore.getState().updateThread(threadId, {
    urgencyScore: 0,
    isHeatExtinguished: true,
  });
}

// ---------------------------------------------------------------------------
// Auto-extinguish — called after a reply is sent (Smart Judge)
// ---------------------------------------------------------------------------

/**
 * Fetches the most recent received message in the thread to use as context
 * for the Smart Judge. Returns null if no received message is found.
 */
async function fetchUrgentContext(accountId: string, threadId: string): Promise<string | null> {
  try {
    const messages = await getMessagesForThread(accountId, threadId);
    // Find last message not sent by the account owner (i.e. received, not sent)
    // Messages from SENT label have labelIds, but DbMessage doesn't carry them.
    // Best heuristic: skip the last message (likely the just-sent reply), use the one before.
    const candidates = messages.slice(0, -1);
    const last = candidates[candidates.length - 1];
    if (!last) return null;
    return [last.subject ?? "", (last.body_text ?? last.snippet ?? "").slice(0, 600)].join("\n");
  } catch {
    return null;
  }
}

/**
 * If ai_urgency_auto_extinguish is enabled, the Smart Judge evaluates whether
 * the user's reply resolves the urgent thread. Uses the configured AI provider.
 * Falls back to always-extinguish if the AI call fails or if there's no context.
 */
export async function autoExtinguishOnReply(
  accountId: string,
  threadId: string,
): Promise<void> {
  const autoEnabled = await getSetting("ai_urgency_auto_extinguish");
  if (autoEnabled !== "true") return;

  // Only act on threads with active urgency
  const thread = useThreadStore.getState().threadMap.get(threadId);
  const hasUrgency = thread && (thread.urgencyScore ?? 0) > 0 && !thread.isHeatExtinguished;
  if (!hasUrgency) return;

  // Fetch original urgent message for AI context
  const urgentContext = await fetchUrgentContext(accountId, threadId);

  let resolved: boolean;
  if (urgentContext) {
    try {
      const { judgeUrgencyResolved } = await import("./aiService");
      resolved = await judgeUrgencyResolved(urgentContext);
    } catch {
      // AI unavailable — default to extinguish so UX stays clean
      resolved = true;
    }
  } else {
    // No context available — conservatively extinguish
    resolved = true;
  }

  if (resolved) {
    await extinguishThread(accountId, threadId);
  }

  // Always log the reply interaction (contributes to reputation)
  if (thread?.fromAddress) {
    await logInteraction(accountId, thread.fromAddress, "REPLY_SENT", threadId);
  }
}
