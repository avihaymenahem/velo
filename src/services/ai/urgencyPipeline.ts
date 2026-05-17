import { getSetting } from "@/services/db/settings";
import { setThreadUrgency, setHeatExtinguished } from "@/services/db/threads";
import { getDb } from "@/services/db/connection";
import {
  scoreUrgencyFromText,
  adjustUrgencyWithReputation,
  ragPriorityDomainBoost,
  detectSollecito,
  detectLegalSender,
  sanitizeForUrgencyScoring,
} from "./reputationEngine";

const SKIP_LABELS = new Set(["SENT", "DRAFT", "TRASH", "SPAM"]);
// Gmail category labels that indicate non-Primary threads — urgency is suppressed for these.
const NON_PRIMARY_GMAIL_LABELS = new Set([
  "CATEGORY_UPDATES",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
]);
const EXTINGUISH_RESET_THRESHOLD = 0.3;

interface UrgencySettings {
  behaviorEnabled: boolean;
  urgencyEnabled: boolean;
  priorityDomains: string;
  decayFloorDays: number;
}

let _cache: UrgencySettings | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

async function getUrgencySettings(): Promise<UrgencySettings> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const [behaviorEnabled, urgencyEnabled, priorityDomains, decayFloor] = await Promise.all([
    getSetting("ai_behavior_enabled"),
    getSetting("ai_urgency_enabled"),
    getSetting("rag_priority_domains"),
    getSetting("ai_urgency_decay_floor_days"),
  ]);
  _cache = {
    behaviorEnabled: behaviorEnabled !== "false",
    urgencyEnabled: urgencyEnabled !== "false",
    priorityDomains: priorityDomains ?? "",
    decayFloorDays: parseInt(decayFloor ?? "30", 10),
  };
  _cacheTime = now;
  return _cache;
}

/** Invalidate the settings cache — call whenever urgency-related settings change. */
export function invalidateUrgencySettingsCache(): void {
  _cache = null;
}

export interface ThreadUrgencyParams {
  accountId: string;
  threadId: string;
  subject: string | null;
  bodyText: string | null;
  fromAddress: string | null;
  fromName?: string | null;
  lastMessageAt: number; // ms since epoch
  labelIds: string[];
}

/**
 * Score urgency for a newly synced thread and persist the result.
 * All errors are swallowed — urgency is best-effort and must never block sync.
 */
export async function processThreadUrgency(params: ThreadUrgencyParams): Promise<void> {
  try {
    const settings = await getUrgencySettings();
    if (!settings.behaviorEnabled || !settings.urgencyEnabled) return;

    if (params.labelIds.some((l) => SKIP_LABELS.has(l))) return;
    // Non-Primary Gmail categories: no urgency scoring
    if (params.labelIds.some((l) => NON_PRIMARY_GMAIL_LABELS.has(l))) return;

    const ageDays = (Date.now() - params.lastMessageAt) / 86_400_000;
    if (ageDays > settings.decayFloorDays) return;

    const subject = params.subject ?? "";
    const bodyText = params.bodyText ?? "";
    const fromAddress = params.fromAddress ?? "";
    const fromName = params.fromName ?? "";

    const isSollecito = detectSollecito(subject, bodyText);
    const isLegalSender = detectLegalSender(fromName, fromAddress);

    let rawScore = scoreUrgencyFromText(subject, sanitizeForUrgencyScoring(bodyText));

    // Sollecito floor: pending follow-ups are never below 0.4
    if (isSollecito) rawScore = Math.max(rawScore, 0.4);

    // Skip threads with no urgency signal unless legal sender
    if (rawScore === 0 && !isLegalSender) return;

    const boost = ragPriorityDomainBoost(fromAddress, bodyText, settings.priorityDomains);
    let boostedScore = Math.min(1, rawScore + boost);

    // Legal sender: guaranteed minimum of 0.8 — role beats tone
    if (isLegalSender) boostedScore = Math.max(boostedScore + 0.4, 0.8);
    boostedScore = Math.min(1, boostedScore);

    const finalScore = fromAddress
      ? await adjustUrgencyWithReputation(params.accountId, fromAddress, boostedScore)
      : boostedScore;

    await setThreadUrgency(params.accountId, params.threadId, finalScore);

    // Reset heat-extinguished if a new urgent message re-opens the thread
    if (finalScore >= EXTINGUISH_RESET_THRESHOLD) {
      await setHeatExtinguished(params.accountId, params.threadId, false);
    }
  } catch {
    // Urgency scoring is best-effort — never propagate errors to the caller
  }
}

// ---------------------------------------------------------------------------
// Backfill: score all recent un-scored threads on first activation
// ---------------------------------------------------------------------------

type BackfillRow = {
  id: string;
  account_id: string;
  subject: string | null;
  last_message_at: number | null;
  from_address: string | null;
  from_name: string | null;
  body_text: string | null;
  label_ids: string | null; // GROUP_CONCAT of thread_labels
};

const BACKFILL_BATCH = 20;
const BACKFILL_DELAY_MS = 30;

/**
 * Score urgency for all recent un-scored threads across all accounts.
 * Run once after the user enables Behavioral Intelligence.
 * Emits "velo-sync-done" on completion so the email list refreshes.
 */
export async function runUrgencyBackfill(): Promise<void> {
  const settings = await getUrgencySettings();
  if (!settings.behaviorEnabled || !settings.urgencyEnabled) return;

  const cutoffMs = Date.now() - settings.decayFloorDays * 86_400_000;
  const db = await getDb();
  let offset = 0;

  while (true) {
    const rows = await db.select<BackfillRow[]>(
      `SELECT t.id, t.account_id, t.subject, t.last_message_at,
              m.from_address, m.from_name, m.body_text,
              (SELECT GROUP_CONCAT(tl.label_id) FROM thread_labels tl
               WHERE tl.account_id = t.account_id AND tl.thread_id = t.id) AS label_ids
       FROM threads t
       LEFT JOIN messages m ON m.account_id = t.account_id
         AND m.thread_id = t.id AND m.date = t.last_message_at
       LEFT JOIN thread_categories tc ON tc.account_id = t.account_id AND tc.thread_id = t.id
       WHERE t.urgency_score = 0
         AND (t.manual_urgency_override IS NULL OR t.manual_urgency_override = 0)
         AND t.last_message_at IS NOT NULL
         AND t.last_message_at >= $1
         AND (tc.category IS NULL OR tc.category = 'Primary')
       GROUP BY t.id, t.account_id
       LIMIT $2 OFFSET $3`,
      [cutoffMs, BACKFILL_BATCH, offset],
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      await processThreadUrgency({
        accountId: row.account_id,
        threadId: row.id,
        subject: row.subject,
        bodyText: row.body_text,
        fromAddress: row.from_address,
        fromName: row.from_name,
        lastMessageAt: row.last_message_at ?? 0,
        labelIds: row.label_ids ? row.label_ids.split(",") : [],
      });
      await new Promise<void>((r) => setTimeout(r, BACKFILL_DELAY_MS));
    }

    offset += rows.length;
    if (rows.length < BACKFILL_BATCH) break;
  }

  window.dispatchEvent(new CustomEvent("velo-sync-done"));
}
