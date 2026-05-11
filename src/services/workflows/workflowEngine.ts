import type { DbWorkflowRule } from "@/services/db/workflowRules";
import { getActiveWorkflowRules } from "@/services/db/workflowRules";

export type WorkflowAction =
  | { type: "apply_label"; labelId: string }
  | { type: "send_template"; templateId: string; delayHours?: number }
  | { type: "create_task"; title: string; dueDays?: number }
  | { type: "mark_read" }
  | { type: "archive" }
  | { type: "star" }
  | { type: "forward_to"; email: string };

interface TriggerContext {
  accountId: string;
  messageId?: string;
  threadId?: string;
  fromAddress?: string;
  subject?: string;
  fromDomain?: string;
}

export function parseWorkflowActions(actionsJson: string): WorkflowAction[] {
  try {
    const parsed = JSON.parse(actionsJson);
    if (Array.isArray(parsed)) return parsed as WorkflowAction[];
    return [];
  } catch {
    return [];
  }
}

export function matchesConditions(rule: DbWorkflowRule, context: TriggerContext): boolean {
  if (!rule.trigger_conditions) return true;

  try {
    const conditions = JSON.parse(rule.trigger_conditions) as Record<string, unknown>;
    if (conditions.from_domain && typeof conditions.from_domain === "string") {
      if (context.fromDomain !== conditions.from_domain) return false;
    }
    if (conditions.subject_contains && typeof conditions.subject_contains === "string") {
      if (!context.subject || !context.subject.toLowerCase().includes(conditions.subject_contains.toLowerCase())) {
        return false;
      }
    }
    if (conditions.from_address && typeof conditions.from_address === "string") {
      if (context.fromAddress !== conditions.from_address) return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function evaluateAndExecute(rule: DbWorkflowRule, context: TriggerContext): Promise<void> {
  if (!matchesConditions(rule, context)) return;

  const actions = parseWorkflowActions(rule.actions);

  for (const action of actions) {
    await executeAction(action, context);
  }
}

async function executeAction(action: WorkflowAction, context: TriggerContext): Promise<void> {
  switch (action.type) {
    case "apply_label": {
      const { addThreadLabel } = await import("@/services/emailActions");
      if (context.threadId) {
        await addThreadLabel(context.accountId, context.threadId, action.labelId);
      }
      break;
    }
    case "mark_read": {
      const { markThreadRead } = await import("@/services/emailActions");
      if (context.threadId) {
        await markThreadRead(context.accountId, context.threadId, [], true);
      }
      break;
    }
    case "archive": {
      const { archiveThread } = await import("@/services/emailActions");
      if (context.threadId) {
        await archiveThread(context.accountId, context.threadId, []);
      }
      break;
    }
    case "star": {
      const { starThread } = await import("@/services/emailActions");
      if (context.threadId) {
        await starThread(context.accountId, context.threadId, [], true);
      }
      break;
    }
    case "forward_to":
    case "send_template":
    case "create_task":
      break;
  }
}

export async function evaluateWorkflowRules(accountId: string, event: string, context: TriggerContext): Promise<void> {
  const rules = await getActiveWorkflowRules(accountId, event);
  for (const rule of rules) {
    await evaluateAndExecute(rule, context);
  }
}
