export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  trigger_event: string;
  trigger_conditions: string;
  actions: string;
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: "auto-archive-newsletters",
    name: "Auto-archive newsletters",
    description: "Automatically archive emails with 'newsletter' in the subject",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({ subject_contains: "newsletter" }),
    actions: JSON.stringify([{ type: "archive" }]),
  },
  {
    id: "star-vip-emails",
    name: "Star VIP emails",
    description: "Star emails from your most important clients",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({ from_domain: "client.com" }),
    actions: JSON.stringify([{ type: "star" }]),
  },
  {
    id: "flag-invoices",
    name: "Flag invoices",
    description: "Apply INVOICE label and star emails with 'invoice' in the subject",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({ subject_contains: "invoice" }),
    actions: JSON.stringify([{ type: "apply_label", labelId: "INVOICE" }, { type: "star" }]),
  },
  {
    id: "auto-reply-vacation",
    name: "Auto-reply on vacation",
    description: "Send a vacation auto-reply template to all incoming emails",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({}),
    actions: JSON.stringify([{ type: "send_template", templateId: "vacation-reply" }]),
  },
  {
    id: "followup-3-days",
    name: "Follow-up after 3 days",
    description: "Create a follow-up task when no reply is received within 3 days",
    trigger_event: "no_reply_after_days",
    trigger_conditions: JSON.stringify({ days: 3 }),
    actions: JSON.stringify([{ type: "create_task", title: "Follow up on email", dueDays: 1 }]),
  },
  {
    id: "forward-support",
    name: "Forward support tickets",
    description: "Forward support-related emails to your support team",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({ subject_contains: "support" }),
    actions: JSON.stringify([{ type: "forward_to", email: "support@company.com" }]),
  },
  {
    id: "weekly-digest-reminder",
    name: "Weekly digest reminder",
    description: "Create a task every Monday morning to send the weekly digest",
    trigger_event: "time_based",
    trigger_conditions: JSON.stringify({ cron: "0 9 * * 1" }),
    actions: JSON.stringify([{ type: "create_task", title: "Send weekly digest", dueDays: 0 }]),
  },
  {
    id: "archive-social",
    name: "Archive social notifications",
    description: "Auto-archive and mark as read social media notification emails",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({ from_domain: "linkedin.com" }),
    actions: JSON.stringify([{ type: "archive" }, { type: "mark_read" }]),
  },
  {
    id: "flag-overdue-replies",
    name: "Flag overdue replies",
    description: "Star and create a task for threads with no reply in 7 days",
    trigger_event: "no_reply_after_days",
    trigger_conditions: JSON.stringify({ days: 7 }),
    actions: JSON.stringify([
      { type: "create_task", title: "Overdue: No reply in 7 days", dueDays: 0 },
      { type: "star" },
    ]),
  },
  {
    id: "mark-read-mailing-lists",
    name: "Mark read from mailing lists",
    description: "Auto-mark as read bulk and mailing list emails",
    trigger_event: "email_received",
    trigger_conditions: JSON.stringify({ subject_contains: "unsubscribe" }),
    actions: JSON.stringify([{ type: "mark_read" }]),
  },
];
