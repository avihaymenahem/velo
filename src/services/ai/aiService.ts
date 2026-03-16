import { getActiveProvider } from "./providerManager";
import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { AiError } from "./errors";
import type { DbMessage } from "@/services/db/messages";
import { getSetting } from "@/services/db/settings";
import { updateThreadUrgency } from "@/services/db/threads";
import type { ProofreadResult, MeetingDetectionResult, FilterSuggestion } from "./types";
import {
  SUMMARIZE_PROMPT,
  COMPOSE_PROMPT,
  REPLY_PROMPT,
  IMPROVE_PROMPT,
  SHORTEN_PROMPT,
  FORMALIZE_PROMPT,
  CATEGORIZE_PROMPT,
  SMART_REPLY_PROMPT,
  ASK_INBOX_PROMPT,
  SMART_LABEL_PROMPT,
  EXTRACT_TASK_PROMPT,
  PROOFREAD_PROMPT,
  MEETING_DETECT_PROMPT,
  INBOX_DIGEST_PROMPT,
  URGENCY_SCORE_PROMPT,
  CONTACT_SUMMARY_PROMPT,
  FILTER_SUGGESTIONS_PROMPT,
} from "./prompts";

async function callAi(systemPrompt: string, userContent: string): Promise<string> {
  try {
    const provider = await getActiveProvider();
    return await provider.complete({ systemPrompt, userContent });
  } catch (err) {
    if (err instanceof AiError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("401") || message.includes("authentication")) {
      throw new AiError("AUTH_ERROR", "Invalid API key");
    }
    if (message.includes("429") || message.includes("rate")) {
      throw new AiError("RATE_LIMITED", "Rate limited — please try again shortly");
    }
    throw new AiError("NETWORK_ERROR", message);
  }
}

function formatMessageForSummary(msg: DbMessage): string {
  const from = msg.from_name
    ? `${msg.from_name} <${msg.from_address}>`
    : (msg.from_address ?? "Unknown");
  const date = new Date(msg.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const body = (msg.body_text ?? msg.snippet ?? "").trim();
  return `<email_content>From: ${from}\nDate: ${date}\n\n${body}</email_content>`;
}

export async function summarizeThread(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<string> {
  // Check cache first
  const cached = await getAiCache(accountId, threadId, "summary");
  if (cached) return cached;

  const subject = messages[0]?.subject ?? "No subject";
  const formatted = messages.map(formatMessageForSummary).join("\n---\n");
  const combined = `Subject: ${subject}\n\n${formatted}`.slice(0, 6000);
  const summary = await callAi(SUMMARIZE_PROMPT, combined);

  // Cache the result
  await setAiCache(accountId, threadId, "summary", summary);
  return summary;
}

export async function composeFromPrompt(instructions: string): Promise<string> {
  return callAi(COMPOSE_PROMPT, instructions);
}

export async function generateReply(
  messagesText: string[],
  instructions?: string,
): Promise<string> {
  const combined = messagesText.join("\n---\n").slice(0, 4000);
  const userContent = instructions
    ? `<email_content>${combined}</email_content>\n\nInstructions: ${instructions}`
    : `<email_content>${combined}</email_content>`;
  return callAi(REPLY_PROMPT, userContent);
}

export type TransformType = "improve" | "shorten" | "formalize";

export async function transformText(
  text: string,
  type: TransformType,
): Promise<string> {
  const prompts: Record<TransformType, string> = {
    improve: IMPROVE_PROMPT,
    shorten: SHORTEN_PROMPT,
    formalize: FORMALIZE_PROMPT,
  };
  return callAi(prompts[type], text);
}

export async function generateSmartReplies(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<string[]> {
  // Check cache first
  const cached = await getAiCache(accountId, threadId, "smart_replies");
  if (cached) {
    try {
      return JSON.parse(cached) as string[];
    } catch {
      // Corrupted cache, regenerate
    }
  }

  const formatted = messages.map(formatMessageForSummary).join("\n---\n");
  const combined = formatted.slice(0, 4000);
  const result = await callAi(SMART_REPLY_PROMPT, `<email_content>${combined}</email_content>`);

  // Parse JSON array from response
  let replies: string[];
  try {
    // Extract JSON array from the response (handle potential markdown wrapping)
    // Use non-greedy match to avoid capturing extra content
    const jsonMatch = result.match(/\[[\s\S]*?\]/);
    replies = jsonMatch ? JSON.parse(jsonMatch[0]) as string[] : [result];
  } catch {
    // If parsing fails, split by newlines as fallback
    replies = result
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  // Validate and sanitize each reply
  replies = replies
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.replace(/<[^>]*>/g, "").slice(0, 200));

  // Ensure exactly 3 replies
  while (replies.length < 3) replies.push("Thanks for the update.");
  replies = replies.slice(0, 3);

  // Cache the result
  await setAiCache(accountId, threadId, "smart_replies", JSON.stringify(replies));
  return replies;
}

export async function askInbox(
  question: string,
  _accountId: string,
  context: string,
): Promise<string> {
  const userContent = `<email_content>${context}</email_content>\n\nQuestion: ${question}`;
  return callAi(ASK_INBOX_PROMPT, userContent);
}

const VALID_CATEGORIES = new Set(["Primary", "Updates", "Promotions", "Social", "Newsletters"]);

export async function categorizeThreads(
  threads: { id: string; subject: string; snippet: string; fromAddress: string }[],
): Promise<Map<string, string>> {
  const input = threads
    .map((t) => `<email_content>ID:${t.id} | From:${t.fromAddress} | Subject:${t.subject} | ${t.snippet}</email_content>`)
    .join("\n");

  const validThreadIds = new Set(threads.map((t) => t.id));

  const result = await callAi(CATEGORIZE_PROMPT, input);
  const categories = new Map<string, string>();

  for (const line of result.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const threadId = trimmed.slice(0, colonIdx).trim();
    const category = trimmed.slice(colonIdx + 1).trim();
    // Validate: only accept known thread IDs and valid categories
    if (threadId && category && validThreadIds.has(threadId) && VALID_CATEGORIES.has(category)) {
      categories.set(threadId, category);
    }
  }

  return categories;
}

export async function classifyThreadsBySmartLabels(
  threads: { id: string; subject: string; snippet: string; fromAddress: string }[],
  labelRules: { labelId: string; description: string }[],
): Promise<Map<string, string[]>> {
  const labelDefs = labelRules
    .map((r) => `LABEL_ID:${r.labelId} — ${r.description}`)
    .join("\n");

  const threadData = threads
    .map((t) => `<email_content>ID:${t.id} | From:${t.fromAddress} | Subject:${t.subject} | ${t.snippet}</email_content>`)
    .join("\n");

  const userContent = `Label definitions:\n${labelDefs}\n\nThreads:\n${threadData}`;

  const validThreadIds = new Set(threads.map((t) => t.id));
  const validLabelIds = new Set(labelRules.map((r) => r.labelId));

  const result = await callAi(SMART_LABEL_PROMPT, userContent);
  const assignments = new Map<string, string[]>();

  for (const line of result.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const threadId = trimmed.slice(0, colonIdx).trim();
    const labelsPart = trimmed.slice(colonIdx + 1).trim();
    if (!threadId || !labelsPart || !validThreadIds.has(threadId)) continue;

    const labelIds = labelsPart
      .split(",")
      .map((l) => l.trim())
      .filter((l) => validLabelIds.has(l));

    if (labelIds.length > 0) {
      assignments.set(threadId, labelIds);
    }
  }

  return assignments;
}

export async function extractTaskFromThread(
  _threadId: string,
  _accountId: string,
  messages: DbMessage[],
): Promise<string> {
  const subject = messages[0]?.subject ?? "No subject";
  const formatted = messages.map(formatMessageForSummary).join("\n---\n");
  const combined = `<email_content>Subject: ${subject}\n\n${formatted}</email_content>`.slice(0, 6000);
  return callAi(EXTRACT_TASK_PROMPT, combined);
}

export async function testConnection(): Promise<boolean> {
  try {
    const provider = await getActiveProvider();
    return await provider.testConnection();
  } catch {
    return false;
  }
}

// Task 6: proofreadEmail
// Does NOT cache — proofreading is per-draft-send, results vary each time
export async function proofreadEmail(
  subject: string,
  bodyHtml: string,
  recipients: string[],
): Promise<ProofreadResult> {
  const strippedBody = bodyHtml.replace(/<[^>]*>/g, "");
  const hasAttachmentMention = /\b(attach|attachment|see attached|find attached|enclosed)\b/i.test(strippedBody);
  const userContent = `<email_content>Subject: ${subject}\nTo: ${recipients.join(", ")}\n\nBody:\n${strippedBody}\n\nNote: ${hasAttachmentMention ? "Email mentions attachment" : "No attachment mentioned"}</email_content>`;
  try {
    const raw = await callAi(PROOFREAD_PROMPT, userContent);
    const parsed = JSON.parse(raw) as ProofreadResult;
    return parsed;
  } catch {
    return { issues: [], overallScore: "good" };
  }
}

// Task 7: detectMeetingIntent
export async function detectMeetingIntent(
  threadId: string,
  accountId: string,
  messages: DbMessage[],
): Promise<MeetingDetectionResult | null> {
  const cached = await getAiCache(accountId, threadId, "meeting_intent");
  if (cached !== null) {
    return cached === "null" ? null : (JSON.parse(cached) as MeetingDetectionResult);
  }
  const formatted = messages
    .slice(-3)
    .map(formatMessageForSummary)
    .join("\n---\n")
    .slice(0, 3000);
  const userContent = `<email_content>${formatted}</email_content>`;
  try {
    const raw = await callAi(MEETING_DETECT_PROMPT, userContent);
    const trimmed = raw.trim();
    if (trimmed === "null" || trimmed === "") {
      await setAiCache(accountId, threadId, "meeting_intent", "null");
      return null;
    }
    const parsed = JSON.parse(trimmed) as MeetingDetectionResult;
    await setAiCache(accountId, threadId, "meeting_intent", JSON.stringify(parsed));
    return parsed;
  } catch {
    await setAiCache(accountId, threadId, "meeting_intent", "null");
    return null;
  }
}

// Task 8: generateInboxDigest
// No caching — digest should always be fresh
export async function generateInboxDigest(
  _accountId: string,
  threads: { id: string; subject: string; snippet: string; fromAddress: string; fromName: string; date: number }[],
): Promise<string> {
  const capped = threads.slice(0, 50);
  const formatted = capped
    .map((t, i) => `${i + 1}. From: ${t.fromName || t.fromAddress} | Subject: ${t.subject} | ${t.snippet.slice(0, 100)}`)
    .join("\n")
    .slice(0, 5000);
  const userContent = `<email_content>${formatted}</email_content>`;
  const result = await callAi(INBOX_DIGEST_PROMPT, userContent);
  return result;
}

// Task 9: scoreThreadUrgency + batchScoreUrgency
export async function scoreThreadUrgency(
  threadId: string,
  accountId: string,
  subject: string,
  snippet: string,
  fromAddress: string,
): Promise<"low" | "medium" | "high" | null> {
  const cached = await getAiCache(accountId, threadId, "urgency");
  if (cached !== null) {
    const trimmed = cached.trim().toLowerCase();
    if (trimmed === "low" || trimmed === "medium" || trimmed === "high") {
      return trimmed as "low" | "medium" | "high";
    }
    return null;
  }
  const userContent = `<email_content>From: ${fromAddress}\nSubject: ${subject}\n\n${snippet.slice(0, 500)}</email_content>`;
  try {
    const raw = await callAi(URGENCY_SCORE_PROMPT, userContent);
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "low" || trimmed === "medium" || trimmed === "high") {
      await setAiCache(accountId, threadId, "urgency", trimmed);
      return trimmed as "low" | "medium" | "high";
    }
    return null;
  } catch {
    return null;
  }
}

export async function batchScoreUrgency(
  accountId: string,
  threads: { id: string; subject: string; snippet: string; fromAddress: string }[],
): Promise<void> {
  const enabled = await getSetting("ai_urgency_enabled");
  if (enabled !== "true") return;
  for (const thread of threads) {
    const score = await scoreThreadUrgency(
      thread.id,
      accountId,
      thread.subject,
      thread.snippet,
      thread.fromAddress,
    );
    if (score !== null) {
      await updateThreadUrgency(thread.id, score);
    }
  }
}

// Task 10: generateContactSummary
// Uses contactEmail as the "threadId" parameter in aiCache (intentional — cache table uses a string key)
export async function generateContactSummary(
  accountId: string,
  contactEmail: string,
  recentThreads: { id: string; subject: string; snippet: string; date: number }[],
): Promise<string> {
  const cached = await getAiCache(accountId, contactEmail, "contact_summary");
  if (cached !== null) return cached;
  const formatted = recentThreads
    .map((t, i) => `${i + 1}. [${new Date(t.date).toLocaleDateString()}] ${t.subject}: ${t.snippet.slice(0, 150)}`)
    .join("\n")
    .slice(0, 3000);
  const userContent = `<email_content>Contact: ${contactEmail}\n\nRecent threads:\n${formatted}</email_content>`;
  const result = await callAi(CONTACT_SUMMARY_PROMPT, userContent);
  await setAiCache(accountId, contactEmail, "contact_summary", result);
  return result;
}

// Task 11: suggestFilterRules
// No cache — suggestions should be fresh each time
export async function suggestFilterRules(
  _accountId: string,
  threads: { fromAddress: string; subject: string; snippet: string }[],
): Promise<FilterSuggestion[]> {
  const capped = threads.slice(0, 100);
  const formatted = capped
    .map((t, i) => `${i + 1}. From: ${t.fromAddress} | Subject: ${t.subject} | ${t.snippet.slice(0, 80)}`)
    .join("\n")
    .slice(0, 6000);
  const userContent = `<email_content>${formatted}</email_content>`;
  try {
    const raw = await callAi(FILTER_SUGGESTIONS_PROMPT, userContent);
    const parsed = JSON.parse(raw) as FilterSuggestion[];
    return parsed.filter((item) =>
      ["archive", "label", "trash"].includes(item.suggestedAction),
    );
  } catch {
    return [];
  }
}
