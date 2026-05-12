import { getDb } from "../db/connection";
import { getFilterRuleById, getFilterConditionsForRule } from "../db/filters";
import type { FilterCondition } from "../db/filters";
import { evaluateCondition } from "./filterEngine";

export interface ConditionDebugResult {
  condition: FilterCondition;
  passed: boolean;
  matchedText: string | null;
}

export interface FilterTestResult {
  conditions: ConditionDebugResult[];
  overall: boolean;
}

/**
 * Debug a filter rule against a stored message.
 * Loads the rule, its conditions, and the message from DB,
 * then evaluates each condition and returns per-condition details
 * plus an overall pass/fail.
 */
export async function testFilterOnMessage(
  ruleId: string,
  messageId: string,
): Promise<FilterTestResult> {
  const db = await getDb();

  const rule = await getFilterRuleById(ruleId);
  if (!rule) throw new Error(`Filter rule not found: ${ruleId}`);

  const msg = await db.select<{
    id: string;
    thread_id: string;
    from_address: string | null;
    from_name: string | null;
    to_addresses: string | null;
    cc_addresses: string | null;
    bcc_addresses: string | null;
    reply_to: string | null;
    subject: string | null;
    snippet: string | null;
    date: number;
    is_read: number;
    is_starred: number;
    body_html: string | null;
    body_text: string | null;
    raw_size: number | null;
    internal_date: number | null;
  }[]>(
    "SELECT id, thread_id, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, reply_to, subject, snippet, date, is_read, is_starred, body_html, body_text, raw_size, internal_date FROM messages WHERE id = $1",
    [messageId],
  );
  if (msg.length === 0) throw new Error(`Message not found: ${messageId}`);

  const row = msg[0]!;

  // Check for attachments
  const attachRows = await db.select<{ cnt: number }[]>(
    "SELECT COUNT(*) AS cnt FROM attachments WHERE message_id = $1",
    [messageId],
  );
  const hasAttachments = (attachRows[0]?.cnt ?? 0) > 0;

  const message = {
    id: row.id,
    threadId: row.thread_id,
    fromAddress: row.from_address,
    fromName: row.from_name,
    toAddresses: row.to_addresses,
    ccAddresses: row.cc_addresses,
    bccAddresses: row.bcc_addresses,
    replyTo: row.reply_to,
    subject: row.subject,
    snippet: row.snippet ?? "",
    date: row.date,
    isRead: row.is_read === 1,
    isStarred: row.is_starred === 1,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    rawSize: row.raw_size ?? 0,
    internalDate: row.internal_date ?? row.date,
    labelIds: [] as string[],
    hasAttachments,
    attachments: [] as { filename: string; mimeType: string; size: number; gmailAttachmentId: string; contentId: string | null; isInline: boolean }[],
    listUnsubscribe: null,
    listUnsubscribePost: null,
    authResults: null,
  };

  const conditions = await getFilterConditionsForRule(ruleId);

  if (conditions.length === 0) {
    return { conditions: [], overall: true };
  }

  const operator = (rule.group_operator as "AND" | "OR" | undefined) ?? "AND";

  const results: ConditionDebugResult[] = conditions.map((condition) => {
    const { passed, matchedText } = evaluateCondition(condition, message);
    return { condition, passed, matchedText };
  });

  const overall = operator === "AND"
    ? results.every((r) => r.passed)
    : results.some((r) => r.passed);

  return { conditions: results, overall };
}
