import { getContactByEmail } from "@/services/db/contacts";
import { escapeHtml } from "@/utils/sanitize";

export interface VariableContext {
  recipientEmail?: string;
  recipientName?: string;
  senderEmail?: string;
  senderName?: string;
  subject?: string;
}

export interface TemplateVariable {
  key: string;
  desc: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "{{first_name}}", desc: "Recipient's first name" },
  { key: "{{last_name}}", desc: "Recipient's last name" },
  { key: "{{email}}", desc: "Recipient's email address" },
  { key: "{{my_name}}", desc: "Your display name" },
  { key: "{{my_email}}", desc: "Your email address" },
  { key: "{{subject}}", desc: "Thread subject" },
  { key: "{{date}}", desc: "Today's date" },
  { key: "{{day}}", desc: "Day of week" },
];

function splitName(fullName: string | undefined): { first: string; last: string } {
  if (!fullName) return { first: "", last: "" };
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] ?? "",
    last: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

/**
 * Resolve recipient name from contacts DB if only email is available.
 */
async function resolveRecipientName(ctx: VariableContext): Promise<string> {
  if (ctx.recipientName) return ctx.recipientName;
  if (!ctx.recipientEmail) return "";
  try {
    const contact = await getContactByEmail(ctx.recipientEmail);
    return contact?.display_name ?? "";
  } catch {
    return "";
  }
}

/**
 * Interpolate template variables in HTML string.
 * Replaces {{variable}} patterns with resolved values.
 */
export async function interpolateVariables(
  html: string,
  ctx: VariableContext,
): Promise<string> {
  // Only do work if there are variables to replace
  if (!html.includes("{{")) return html;

  const recipientName = await resolveRecipientName(ctx);
  const { first, last } = splitName(recipientName);
  const senderParts = splitName(ctx.senderName);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dayStr = now.toLocaleDateString("en-US", { weekday: "long" });

  const replacements: Record<string, string> = {
    "{{first_name}}": first,
    "{{last_name}}": last,
    "{{email}}": ctx.recipientEmail ?? "",
    "{{my_name}}": ctx.senderName ?? senderParts.first,
    "{{my_email}}": ctx.senderEmail ?? "",
    "{{subject}}": ctx.subject ?? "",
    "{{date}}": dateStr,
    "{{day}}": dayStr,
  };

  let result = html;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, escapeHtml(value));
  }

  return result;
}

/**
 * Synchronous version for simple variable interpolation without DB lookups.
 * Uses only the context provided (no contact resolution).
 */
export function interpolateVariablesSync(
  html: string,
  ctx: VariableContext,
): string {
  if (!html.includes("{{")) return html;

  const { first, last } = splitName(ctx.recipientName);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const dayStr = now.toLocaleDateString("en-US", { weekday: "long" });

  const replacements: Record<string, string> = {
    "{{first_name}}": first,
    "{{last_name}}": last,
    "{{email}}": ctx.recipientEmail ?? "",
    "{{my_name}}": ctx.senderName ?? "",
    "{{my_email}}": ctx.senderEmail ?? "",
    "{{subject}}": ctx.subject ?? "",
    "{{date}}": dateStr,
    "{{day}}": dayStr,
  };

  let result = html;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, escapeHtml(value));
  }

  return result;
}
