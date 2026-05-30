import { getSetting } from "@/services/db/settings";
import { getActiveProvider } from "./providerManager";
import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { AiError } from "./errors";
import type { DbMessage } from "@/services/db/messages";
import type { ConversationMessage } from "./types";
import {
  SUMMARIZE_PROMPT,
  COMPOSE_PROMPT,
  MODIFY_PROMPT,
  COMPOSER_FEEDBACK_PROMPT,
  REPLY_PROMPT,
  IMPROVE_PROMPT,
  SHORTEN_PROMPT,
  FORMALIZE_PROMPT,
  CATEGORIZE_PROMPT,
  SMART_REPLY_PROMPT,
  ASK_INBOX_PROMPT,
  SMART_LABEL_PROMPT,
  EXTRACT_TASK_PROMPT,
  HEAT_EXTINGUISH_JUDGE_PROMPT,
  URGENCY_SCORE_PROMPT,
} from "./prompts";
import { getSoul } from "./soulService";

async function callAi(systemPrompt: string, userContent: string, options?: { skipLanguage?: boolean; skipSoul?: boolean; conversationHistory?: ConversationMessage[] }): Promise<string> {
  let finalSystemPrompt = systemPrompt;

  // Prepend SOUL.md content as base personality
  if (!options?.skipSoul) {
    try {
      const soul = getSoul();
      if (soul) {
        finalSystemPrompt = soul + "\n\n---\n\n" + systemPrompt;
      }
    } catch {
      // Continue without soul if unavailable
    }
  }

  // Append language instruction for text-heavy responses if a non-English language is set
  const textPrompts = [
    SUMMARIZE_PROMPT,
    COMPOSE_PROMPT,
    REPLY_PROMPT,
    IMPROVE_PROMPT,
    SHORTEN_PROMPT,
    FORMALIZE_PROMPT,
    ASK_INBOX_PROMPT,
    SMART_REPLY_PROMPT,
    COMPOSER_FEEDBACK_PROMPT,
  ];

  if (textPrompts.includes(systemPrompt) && !options?.skipLanguage) {
    try {
      const lang = await getSetting("ai_language");
      if (lang && lang !== "English") {
        finalSystemPrompt += `\n\nIMPORTANT: You must output your response in ${lang}.`;
      }
    } catch (err) {
      console.error("Failed to fetch AI language setting:", err);
    }
  }

  try {
    const provider = await getActiveProvider();
    return await provider.complete({
      systemPrompt: finalSystemPrompt,
      userContent,
      conversationHistory: options?.conversationHistory,
    });

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

export async function composeFromPrompt(instructions: string, options?: { skipLanguage?: boolean; conversationHistory?: ConversationMessage[] }): Promise<string> {
  return callAi(COMPOSE_PROMPT, instructions, options);
}

export async function generateComposerFeedback(
  draftHtml: string,
  context?: { operation?: string },
): Promise<string> {
  const draftText = draftHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
  // Draft is in <email_draft> tags so the AI can detect its language unambiguously.
  // Operation context is outside those tags and must NOT influence the response language.
  const operationBlock = context?.operation
    ? `\n\n<operation_context>${context.operation}</operation_context>`
    : "";
  const userContent = `<email_draft>\n${draftText}\n</email_draft>${operationBlock}`;
  return callAi(COMPOSER_FEEDBACK_PROMPT, userContent);
}

export async function modifyEmailContent(currentBody: string, instructions: string, conversationHistory?: ConversationMessage[]): Promise<string> {
  const userContent = `<current_body>${currentBody}</current_body>\n\nUser instructions: ${instructions}`;
  // skipLanguage: true because MODIFY_PROMPT itself handles language continuity
  return callAi(MODIFY_PROMPT, userContent, { skipLanguage: true, conversationHistory });
}

export async function generateReply(
  messagesText: string[],
  instructions?: string,
  senderPastReplies?: string[],
  conversationHistory?: ConversationMessage[],
): Promise<string> {
  const combined = messagesText.join("\n---\n").slice(0, 4000);
  let userContent = `<email_content>${combined}</email_content>`;

  if (senderPastReplies?.length) {
    const repliesText = senderPastReplies
      .map((r, i) => `[Reply ${i + 1}]\n${r}`)
      .join("\n\n");
    userContent += `\n\n<past_replies_to_sender>\n${repliesText}\n</past_replies_to_sender>`;
  }

  if (instructions) {
    userContent += `\n\nInstructions: ${instructions}`;
  }

  // skipLanguage: true — REPLY_PROMPT detects email language and responds in kind
  return callAi(REPLY_PROMPT, userContent, { skipLanguage: true, conversationHistory });
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
  // skipLanguage: true — prompts already enforce "same language as input"
  return callAi(prompts[type], text, { skipLanguage: true });
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
  // skipLanguage: true — SMART_REPLY_PROMPT detects email language and responds in kind
  const result = await callAi(SMART_REPLY_PROMPT, `<email_content>${combined}</email_content>`, { skipLanguage: true });

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
  _accountId: string | null,
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
  // Inject current timestamp so the AI can compute relative due dates
  const nowTs = Math.floor(Date.now() / 1000).toString();
  let prompt = EXTRACT_TASK_PROMPT.replace("CURRENT_UNIX_TS", nowTs).replace("CURRENT_UNIX_TS", nowTs);
  // The timestamp injection produces a new string that no longer matches the EXTRACT_TASK_PROMPT
  // constant, so callAi's textPrompts.includes() check would skip language injection.
  // Apply the language setting manually here instead.
  try {
    const lang = await getSetting("ai_language");
    if (lang && lang !== "English") {
      prompt += `\n\nIMPORTANT: You must output the task titles and descriptions in ${lang}.`;
    }
  } catch {
    // Continue without language setting
  }
  return callAi(prompt, combined, { skipLanguage: true });
}

export async function testConnection(): Promise<boolean> {
  try {
    const provider = await getActiveProvider();
    return await provider.testConnection();
  } catch {
    return false;
  }
}

/**
 * Smart Judge: determines whether replying to an urgent email likely resolves it.
 * Returns true → RESOLVED (extinguish), false → PENDING (just log).
 * Falls back to true on any AI error so the UX degrades gracefully.
 */
export async function judgeUrgencyResolved(
  urgentEmailText: string,
  replyText?: string,
): Promise<boolean> {
  try {
    let userContent = `<original_email>${urgentEmailText.slice(0, 600)}</original_email>`;
    if (replyText) {
      userContent += `\n<user_reply>${replyText.slice(0, 400)}</user_reply>`;
    }
    const result = await callAi(HEAT_EXTINGUISH_JUDGE_PROMPT, userContent, { skipLanguage: true });
    return result.trim().toUpperCase().startsWith("RESOLVED");
  } catch {
    return true;
  }
}

/**
 * Score urgency for an email thread using the active AI provider.
 * Returns a value in [0, 1], or null if AI is not available / fails.
 * Results are cached in ai_cache (type "urgency") to avoid repeated calls.
 */
export async function scoreUrgencyWithAi(
  accountId: string,
  threadId: string,
  subject: string,
  bodyText: string,
  fromAddress: string,
  fromName: string,
): Promise<number | null> {
  const cached = await getAiCache(accountId, threadId, "urgency");
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached) as { score: number };
      return typeof parsed.score === "number" ? Math.min(1, Math.max(0, parsed.score)) : null;
    } catch {
      // Corrupted cache — fall through to re-score
    }
  }

  const header = `From: ${fromName ? `${fromName} ` : ""}<${fromAddress}>\nSubject: ${subject}`;
  const content = `${header}\n\n${bodyText}`.slice(0, 2000);
  const result = await callAi(
    URGENCY_SCORE_PROMPT,
    `<email_content>${content}</email_content>`,
    { skipLanguage: true, skipSoul: true },
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*?\}/);
    const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as { score: number }) : null;
    const score = parsed && typeof parsed.score === "number"
      ? Math.min(1, Math.max(0, parsed.score))
      : null;
    if (score !== null) {
      await setAiCache(accountId, threadId, "urgency", JSON.stringify({ score }));
    }
    return score;
  } catch {
    return null;
  }
}
