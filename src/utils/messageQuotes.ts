import i18n from "@/i18n";
import { escapeHtml, sanitizeHtml } from "@/utils/sanitize";

export interface QuoteMessage {
  from_name: string | null;
  from_address: string | null;
  date: string | number;
  subject?: string | null;
  to_addresses?: string | null;
  body_html: string | null;
  body_text: string | null;
}

interface QuoteOptions {
  language?: string;
}

function quoteT(language?: string) {
  return i18n.getFixedT(language ?? i18n.language, "email");
}

function formatDate(date: string | number, language?: string): string {
  return new Date(date).toLocaleString(language ?? i18n.language);
}

function formatSender(msg: QuoteMessage, unknownSender: string): string {
  if (msg.from_name) {
    const address = msg.from_address ? ` &lt;${escapeHtml(msg.from_address)}&gt;` : "";
    return `${escapeHtml(msg.from_name)}${address}`;
  }

  return escapeHtml(msg.from_address ?? unknownSender);
}

function formatBody(msg: QuoteMessage): string {
  return msg.body_html ? sanitizeHtml(msg.body_html) : escapeHtml(msg.body_text ?? "");
}

export function buildReplyQuote(msg: QuoteMessage, options: QuoteOptions = {}): string {
  const t = quoteT(options.language);
  const language = options.language ?? i18n.language;
  const date = formatDate(msg.date, language);
  const from = formatSender(msg, t("quote.unknownSender"));
  const body = formatBody(msg);
  const header = t("quote.replyHeader", { date, from });

  return `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666">${header}<br>${body}</div>`;
}

export function buildForwardQuote(msg: QuoteMessage, options: QuoteOptions = {}): string {
  const t = quoteT(options.language);
  const language = options.language ?? i18n.language;
  const date = formatDate(msg.date, language);
  const from = formatSender(msg, "");
  const body = formatBody(msg);

  return [
    "<br><br>",
    t("quote.forwardHeader"),
    "<br>",
    t("quote.from", { from }),
    "<br>",
    t("quote.date", { date }),
    "<br>",
    t("quote.subject", { subject: escapeHtml(msg.subject ?? "") }),
    "<br>",
    t("quote.to", { to: escapeHtml(msg.to_addresses ?? "") }),
    "<br><br>",
    body,
  ].join("");
}
