import { getActiveProvider } from "./providerManager";
import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { AiError } from "./errors";
import type { DbMessage } from "@/services/db/messages";
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
