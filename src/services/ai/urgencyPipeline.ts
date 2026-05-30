import { getSetting } from "@/services/db/settings";
import { setThreadUrgency, setHeatExtinguished } from "@/services/db/threads";
import { getDb } from "@/services/db/connection";
import {
  scoreUrgencyFromText,
  adjustUrgencyWithReputation,
  ragPriorityDomainBoost,
  sanitizeForUrgencyScoring,
} from "./reputationEngine";
import { scoreUrgencyWithAi } from "./aiService";
import { isAiAvailable } from "./providerManager";

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
  decayStartDays: number;
  decayFloorDays: number;
}

let _cache: UrgencySettings | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

async function getUrgencySettings(): Promise<UrgencySettings> {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  const [behaviorEnabled, urgencyEnabled, priorityDomains, decayStart, decayFloor] = await Promise.all([
    getSetting("ai_behavior_enabled"),
    getSetting("ai_urgency_enabled"),
    getSetting("rag_priority_domains"),
    getSetting("ai_urgency_decay_start_days"),
    getSetting("ai_urgency_decay_floor_days"),
  ]);
  _cache = {
    behaviorEnabled: behaviorEnabled !== "false",
    urgencyEnabled: urgencyEnabled !== "false",
    priorityDomains: priorityDomains ?? "",
    decayStartDays: parseInt(decayStart ?? "20", 10),
    decayFloorDays: parseInt(decayFloor ?? "30", 10),
  };
  _cacheTime = now;
  return _cache;
}

export async function getDecaySettings(): Promise<{ decayStartDays: number; decayFloorDays: number }> {
  const s = await getUrgencySettings();
  return { decayStartDays: s.decayStartDays, decayFloorDays: s.decayFloorDays };
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
 * Uses the active AI provider when available; falls back to keyword heuristics.
 * All errors are swallowed — urgency is best-effort and must never block sync.
 */
export async function processThreadUrgency(params: ThreadUrgencyParams): Promise<void> {
  try {
    const settings = await getUrgencySettings();
    if (!settings.behaviorEnabled || !settings.urgencyEnabled) return;

    if (params.labelIds.some((l) => SKIP_LABELS.has(l))) return;
    if (params.labelIds.some((l) => NON_PRIMARY_GMAIL_LABELS.has(l))) return;

    // Skip muted threads — their urgency score is managed by the mute action
    const db = await getDb();
    const rows = await db.select<{ is_muted: number }[]>(
      "SELECT is_muted FROM threads WHERE account_id = ?1 AND id = ?2",
      [params.accountId, params.threadId],
    );
    if (rows[0]?.is_muted === 1) return;

    const ageDays = (Date.now() - params.lastMessageAt) / 86_400_000;
    if (ageDays > settings.decayFloorDays) return;

    const subject = params.subject ?? "";
    const bodyText = params.bodyText ?? "";
    const fromAddress = params.fromAddress ?? "";
    const fromName = params.fromName ?? "";

    let rawScore: number;

    const aiAvailable = await isAiAvailable();
    if (aiAvailable) {
      const aiScore = await scoreUrgencyWithAi(
        params.accountId,
        params.threadId,
        subject,
        sanitizeForUrgencyScoring(bodyText),
        fromAddress,
        fromName,
      );
      if (aiScore !== null) {
        rawScore = aiScore;
      } else {
        // AI call failed — fall back to keywords
        rawScore = scoreUrgencyFromText(subject, sanitizeForUrgencyScoring(bodyText));
      }
    } else {
      rawScore = scoreUrgencyFromText(subject, sanitizeForUrgencyScoring(bodyText));
    }

    // Skip threads with no urgency signal at all
    if (rawScore === 0) return;

    // Apply user-configured priority domain boost (context AI doesn't have)
    const boost = ragPriorityDomainBoost(fromAddress, bodyText, settings.priorityDomains);
    const boostedScore = Math.min(1, rawScore + boost);

    // Apply behavioral reputation penalty (history AI doesn't have)
    const finalScore = fromAddress
      ? await adjustUrgencyWithReputation(params.accountId, fromAddress, boostedScore)
      : boostedScore;

    await setThreadUrgency(params.accountId, params.threadId, finalScore);

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

// ---------------------------------------------------------------------------
// Extinguish backfill: retroactively resolve threads already replied to
// ---------------------------------------------------------------------------

/**
 * For each urgent unextinguished thread within the decay window where the user
 * has already sent a reply, run the Smart Judge and extinguish (or decay) it.
 * Safe to run at startup and after every resync — skips already-extinguished threads.
 */
export async function runExtinguishBackfill(): Promise<void> {
  const settings = await getUrgencySettings();
  if (!settings.behaviorEnabled || !settings.urgencyEnabled) return;

  const autoExtinguish = await getSetting("ai_urgency_auto_extinguish");
  if (autoExtinguish !== "true") return;

  const cutoffMs = Date.now() - settings.decayFloorDays * 86_400_000;
  const db = await getDb();

  // Threads urgent + not extinguished + within decay window + user has already replied
  const rows = await db.select<{
    thread_id: string;
    account_id: string;
    urgency_score: number;
    received_subject: string | null;
    received_text: string | null;
    reply_text: string | null;
  }[]>(
    `SELECT
       t.id            AS thread_id,
       t.account_id,
       t.urgency_score,
       (SELECT m.subject FROM messages m
        WHERE m.account_id = t.account_id AND m.thread_id = t.id
        ORDER BY m.date ASC LIMIT 1)                              AS received_subject,
       (SELECT m.body_text FROM messages m
        WHERE m.account_id = t.account_id AND m.thread_id = t.id
          AND LOWER(m.from_address) != LOWER(a.email)
        ORDER BY m.date DESC LIMIT 1)                             AS received_text,
       (SELECT m.body_text FROM messages m
        WHERE m.account_id = t.account_id AND m.thread_id = t.id
          AND LOWER(m.from_address) = LOWER(a.email)
        ORDER BY m.date DESC LIMIT 1)                             AS reply_text
     FROM threads t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.urgency_score > 0
       AND t.is_heat_extinguished = 0
       AND (t.manual_urgency_override IS NULL OR t.manual_urgency_override = 0)
       AND t.last_message_at IS NOT NULL
       AND t.last_message_at >= $1`,
    [cutoffMs],
  );

  // Only act where the user has actually sent a reply
  const replied = rows.filter((r) => (r.reply_text ?? "").trim().length > 10);
  if (replied.length === 0) return;

  const aiAvailable = await isAiAvailable();
  const { judgeUrgencyResolved } = await import("./aiService");

  for (const row of replied) {
    try {
      const receivedText = [row.received_subject ?? "", (row.received_text ?? "").slice(0, 600)]
        .filter(Boolean)
        .join("\n");
      const replyText = (row.reply_text ?? "").slice(0, 400);

      let resolved: boolean;
      if (aiAvailable && receivedText) {
        try {
          resolved = await judgeUrgencyResolved(receivedText, replyText);
        } catch {
          resolved = true; // AI unavailable → treat as resolved
        }
      } else {
        resolved = true; // no context or AI → user replied, assume resolved
      }

      if (resolved) {
        await setHeatExtinguished(row.account_id, row.thread_id, true);
      } else {
        const decayed = row.urgency_score * 0.5;
        await setThreadUrgency(row.account_id, row.thread_id, decayed);
      }
    } catch {
      // best-effort — never block
    }
    await new Promise<void>((r) => setTimeout(r, BACKFILL_DELAY_MS));
  }

  window.dispatchEvent(new CustomEvent("velo-sync-done"));
}
