import { queryWithRetry } from "../db/connection";
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
  const rule = await getFilterRuleById(ruleId);
  if (!rule) throw new Error(`Filter rule not found: ${ruleId}`);

  const message = await queryWithRetry(async (db) => {
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

    const attachRows = await db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM attachments WHERE message_id = $1",
      [messageId],
    );
    const hasAttachments = (attachRows[0]?.cnt ?? 0) > 0;

    return {
      id: msg[0]!.id,
      threadId: msg[0]!.thread_id,
      fromAddress: msg[0]!.from_address,
      fromName: msg[0]!.from_name,
      toAddresses: msg[0]!.to_addresses,
      ccAddresses: msg[0]!.cc_addresses,
      bccAddresses: msg[0]!.bcc_addresses,
      replyTo: msg[0]!.reply_to,
      subject: msg[0]!.subject,
      snippet: msg[0]!.snippet ?? "",
      date: msg[0]!.date,
      isRead: msg[0]!.is_read === 1,
      isStarred: msg[0]!.is_starred === 1,
      bodyHtml: msg[0]!.body_html,
      bodyText: msg[0]!.body_text,
      rawSize: msg[0]!.raw_size ?? 0,
      internalDate: msg[0]!.internal_date ?? msg[0]!.date,
      labelIds: [] as string[],
      hasAttachments,
      attachments: [] as { filename: string; mimeType: string; size: number; gmailAttachmentId: string; contentId: string | null; isInline: boolean }[],
      listUnsubscribe: null,
      listUnsubscribePost: null,
      authResults: null,
    };
  });

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
