import { getDb } from "@/services/db/connection";
import { getSetting } from "@/services/db/settings";

export type InteractionAction = "MUTE_URGENCY" | "TASK_COMPLETE" | "REPLY_SENT";

// ---------------------------------------------------------------------------
// Interaction logging
// ---------------------------------------------------------------------------

export async function logInteraction(
  accountId: string,
  fromAddress: string,
  action: InteractionAction,
  threadId?: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO interaction_history (account_id, from_address, action, thread_id)
     VALUES ($1, $2, $3, $4)`,
    [accountId, fromAddress.toLowerCase(), action, threadId ?? null],
  );
}

// ---------------------------------------------------------------------------
// Reputation calculation
// ---------------------------------------------------------------------------

/** Count how many times a sender's urgency was muted within the window. */
export async function getSenderMuteCount(
  accountId: string,
  fromAddress: string,
  windowDays: number,
): Promise<number> {
  const db = await getDb();
  const cutoff = Math.floor(Date.now() / 1000) - windowDays * 86400;
  type Row = { cnt: number };
  const [row] = await db.select<Row[]>(
    `SELECT COUNT(*) as cnt FROM interaction_history
     WHERE account_id = $1 AND from_address = $2 AND action = 'MUTE_URGENCY' AND created_at >= $3`,
    [accountId, fromAddress.toLowerCase(), cutoff],
  );
  return row?.cnt ?? 0;
}

/**
 * Returns a penalty multiplier in [0, 1].
 * 1.0 = no penalty (sender is trustworthy).
 * Approaches 0 as mute count exceeds threshold.
 */
export async function getUrgencyPenalty(
  accountId: string,
  fromAddress: string,
): Promise<number> {
  const windowDays = parseInt((await getSetting("ai_urgency_mute_window_days")) ?? "30", 10);
  const threshold = parseInt((await getSetting("ai_urgency_mute_threshold")) ?? "3", 10);

  const muteCount = await getSenderMuteCount(accountId, fromAddress, windowDays);
  if (muteCount === 0) return 1.0;

  // Linear decay: at threshold, penalty is 0.5; beyond threshold approaches 0
  const ratio = Math.min(muteCount / threshold, 2);
  return Math.max(0, 1 - ratio * 0.5);
}

/**
 * Apply reputation penalty to a raw urgency score.
 * Returns the adjusted score in [0, 1].
 */
export async function adjustUrgencyWithReputation(
  accountId: string,
  fromAddress: string,
  rawUrgency: number,
): Promise<number> {
  const penalty = await getUrgencyPenalty(accountId, fromAddress);
  return Math.max(0, Math.min(1, rawUrgency * penalty));
}

// ---------------------------------------------------------------------------
// Basic urgency keyword scoring (used during sync / email import)
// ---------------------------------------------------------------------------

const HIGH_URGENCY_KEYWORDS = [
  /urgent/i, /asap/i, /as soon as possible/i, /immediately/i,
  /critical/i, /emergency/i, /deadline/i, /overdue/i,
  /urgente/i, /immediatamente/i, /scadenza/i,
  /dringend/i, /sofort/i, /frist/i,
  /inmediatamente/i, /plazo/i,
  /immédiatement/i, /délai/i,
];

// Patterns indicating an unanswered follow-up / pending request (IT · EN · FR · ES · DE)
const SOLLECITO_PATTERNS: RegExp[] = [
  /sollecito/i, /in attesa\b/i, /attendo\b.{0,30}riscontro/i,
  /rimango in attesa/i, /rammento/i, /come da mia precedente/i,
  /ancora in attesa/i, /non ho ricevuto risposta/i,
  /mancata risposta/i,
  /follow[- ]?up/i, /following up/i, /awaiting your reply/i,
  /no response received/i, /gentle reminder/i, /kind reminder/i,
  /as per my previous/i, /as previously mentioned/i,
  /still waiting/i, /haven.?t heard back/i,
  /relance/i, /sans réponse/i,
  /recordatorio/i, /sin respuesta/i,
  /erinnerung/i, /keine antwort/i,
];

// Legal / professional sender signals (name or address)
const LEGAL_SENDER_PATTERNS: RegExp[] = [
  /avvocato/i, /avv\./i, /studio legale/i, /\blegale\b/i,
  /\blegal\b/i, /law firm/i, /attorney/i, /counsel/i,
  /studio professionale/i, /\bstudio\b.{0,20}(ass|assoc|prof)/i,
  /\bpec\b/i, /\.pec\./i,
  /notai?o/i, /notary/i,
  /avocat/i, /\bcabinet\b/i,
  /abogado/i, /\bdespacho\b/i,
  /rechtsanwalt/i, /kanzlei/i,
];

// Disclaimer patterns — strip everything after these to clean the signal
const DISCLAIMER_PATTERNS: RegExp[] = [
  /ai sensi della l\.?\s*196\/0?3[\s\S]*/i,
  /ai sensi del d\.?\s*lgs\.?\s*196[\s\S]*/i,
  /ai sensi del regolamento\s+ue\s+2016\/679[\s\S]*/i,
  /\bgdpr\b[\s\S]*/i,
  /under the italian (privacy )?law[\s\S]*/i,
  /privacy policy[\s\S]*/i,
  /\bdisclaimer\b[\s\S]*/i,
  /this (e-?mail|message) (and any attachments? )?is intended[\s\S]*/i,
  /confidentiality notice[\s\S]*/i,
  /\bconfidential(ity)?\b.{0,30}notice[\s\S]*/i,
];

/**
 * Strip legal/privacy disclaimers from body text before urgency scoring.
 * Removes everything after the first disclaimer trigger found.
 */
export function sanitizeForUrgencyScoring(text: string): string {
  let cleaned = text;
  for (const pat of DISCLAIMER_PATTERNS) {
    cleaned = cleaned.replace(pat, "");
  }
  return cleaned.trim();
}

/** Returns true if the email is a follow-up / sollecito. */
export function detectSollecito(subject: string, bodyText: string): boolean {
  const combined = `${subject} ${bodyText.slice(0, 800)}`;
  return SOLLECITO_PATTERNS.some((p) => p.test(combined));
}

/** Returns true if the sender appears to be a legal professional. */
export function detectLegalSender(fromName: string, fromAddress: string): boolean {
  const combined = `${fromName} ${fromAddress}`;
  return LEGAL_SENDER_PATTERNS.some((p) => p.test(combined));
}

/**
 * Score urgency from subject + body text using keyword heuristics.
 * Strips disclaimers before scoring. Returns a value in [0, 1].
 * Does not apply reputation penalty — call adjustUrgencyWithReputation() separately.
 */
export function scoreUrgencyFromText(subject: string, bodyText: string): number {
  const cleanBody = sanitizeForUrgencyScoring(bodyText);
  const combined = `${subject} ${cleanBody.slice(0, 500)}`.toLowerCase();
  let hits = 0;
  for (const kw of HIGH_URGENCY_KEYWORDS) {
    if (kw.test(combined)) hits++;
  }
  // Normalise: 1 hit → 0.3, 2 hits → 0.6, 3+ → 0.9
  return Math.min(0.9, hits * 0.3);
}

// ---------------------------------------------------------------------------
// Temporal decay: urgency naturally fades over time
// ---------------------------------------------------------------------------

/**
 * Pure math — no async, no DB.
 * Returns the decayed urgency score based on thread age.
 *
 * Between decayStartDays and decayFloorDays: linearly interpolates from score → 0.1.
 * Beyond decayFloorDays: clamps to 0.1 (minimum visible, not zero, so the icon still dims).
 */
export function applyTemporalDecay(
  score: number,
  lastMessageAt: number,
  decayStartDays: number,
  decayFloorDays: number,
): number {
  if (score <= 0) return 0;
  const nowMs = Date.now();
  const ageMs = nowMs - lastMessageAt;
  const ageDays = ageMs / 86_400_000;

  if (ageDays <= decayStartDays) return score;

  const window = Math.max(1, decayFloorDays - decayStartDays);
  const elapsed = ageDays - decayStartDays;
  const progress = Math.min(1, elapsed / window);

  // Linear interpolation: score → 0.1
  const decayed = score - progress * (score - 0.1);
  return Math.max(0.1, decayed);
}

// ---------------------------------------------------------------------------
// RAG priority domains: contextual urgency boost (Module 2bis)
// ---------------------------------------------------------------------------

const PRIORITY_CONCEPT_RE =
  /new project|nuovo progetto|nuevo proyecto|nouveau projet|neues projekt|quote|preventivo|presupuesto|devis|kostenvoranschlag/i;

/**
 * Returns a boost (0–0.3) to add to rawUrgency when the sender's domain
 * is in the user-configured priority list, or the body mentions key concepts.
 */
export function ragPriorityDomainBoost(
  fromAddress: string,
  bodyText: string,
  priorityDomainsRaw: string,
): number {
  const domains = priorityDomainsRaw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length > 0) {
    const senderDomain = fromAddress.split("@")[1]?.toLowerCase() ?? "";
    if (domains.some((d) => senderDomain.includes(d))) return 0.3;
  }

  // Concept-based boost (weaker, domain-independent)
  if (PRIORITY_CONCEPT_RE.test(bodyText.slice(0, 500))) return 0.15;

  return 0;
}

// ---------------------------------------------------------------------------
// Maintenance: purge old records
// ---------------------------------------------------------------------------

export async function purgeOldInteractions(): Promise<void> {
  const windowDays = parseInt((await getSetting("ai_urgency_mute_window_days")) ?? "30", 10);
  // Keep records within 2× the window for historical analysis
  const cutoff = Math.floor(Date.now() / 1000) - windowDays * 2 * 86400;
  const db = await getDb();
  await db.execute(
    "DELETE FROM interaction_history WHERE created_at < $1",
    [cutoff],
  );
}
