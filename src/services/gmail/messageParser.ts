import type { GmailMessage, GmailMessagePart, GmailHeader } from "./client";
import { parseAuthenticationResults } from "./authParser";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId: string;
  contentId: string | null;
  isInline: boolean;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string | null;
  ccAddresses: string | null;
  bccAddresses: string | null;
  replyTo: string | null;
  subject: string | null;
  snippet: string;
  date: number;
  isRead: boolean;
  isStarred: boolean;
  bodyHtml: string | null;
  bodyText: string | null;
  rawSize: number;
  internalDate: number;
  labelIds: string[];
  hasAttachments: boolean;
  attachments: ParsedAttachment[];
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
  authResults: string | null;
}

export function parseGmailMessage(msg: GmailMessage): ParsedMessage {
  const headers = msg.payload.headers;
  const from = getHeader(headers, "From");
  const { name: fromName, address: fromAddress } = parseEmailAddress(from);

  const bodyHtml = extractBody(msg.payload, "text/html");
  const bodyText = extractBody(msg.payload, "text/plain");
  const attachments = extractAttachments(msg.payload);
  const authResult = parseAuthenticationResults(headers);

  return {
    id: msg.id,
    threadId: msg.threadId,
    fromAddress: fromAddress,
    fromName: fromName,
    toAddresses: getHeader(headers, "To"),
    ccAddresses: getHeader(headers, "Cc"),
    bccAddresses: getHeader(headers, "Bcc"),
    replyTo: getHeader(headers, "Reply-To"),
    subject: getHeader(headers, "Subject"),
    snippet: msg.snippet,
    date: parseInt(msg.internalDate, 10),
    isRead: !msg.labelIds.includes("UNREAD"),
    isStarred: msg.labelIds.includes("STARRED"),
    bodyHtml: bodyHtml ? decodeBase64Url(bodyHtml) : null,
    bodyText: bodyText ? decodeBase64Url(bodyText) : null,
    rawSize: msg.sizeEstimate,
    internalDate: parseInt(msg.internalDate, 10),
    labelIds: msg.labelIds,
    hasAttachments: attachments.length > 0,
    attachments,
    listUnsubscribe: getHeader(headers, "List-Unsubscribe"),
    listUnsubscribePost: getHeader(headers, "List-Unsubscribe-Post"),
    authResults: authResult ? JSON.stringify(authResult) : null,
  };
}

function getHeader(headers: GmailHeader[], name: string): string | null {
  const header = headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? null;
}

function parseEmailAddress(raw: string | null): {
  name: string | null;
  address: string | null;
} {
  if (!raw) return { name: null, address: null };

  // Format: "Display Name <email@example.com>"
  const angleMatch = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1]?.trim() || null;
    const address = angleMatch[2]?.trim() || null;
    return { name: name === address ? null : name, address };
  }

  // Bare email: "email@example.com"
  return { name: null, address: raw.trim() };
}

function extractBody(
  part: GmailMessagePart,
  mimeType: string,
): string | null {
  if (part.mimeType === mimeType && part.body.data) {
    return part.body.data;
  }

  if (part.parts) {
    for (const child of part.parts) {
      const result = extractBody(child, mimeType);
      if (result) return result;
    }
  }

  return null;
}

function extractAttachments(part: GmailMessagePart): ParsedAttachment[] {
  const results: ParsedAttachment[] = [];
  collectAttachments(part, results);
  return results;
}

function collectAttachments(part: GmailMessagePart, results: ParsedAttachment[]): void {
  if (part.body.attachmentId) {
    const contentIdHeader = part.headers?.find(
      (h) => h.name.toLowerCase() === "content-id",
    );
    const contentDisposition = part.headers?.find(
      (h) => h.name.toLowerCase() === "content-disposition",
    );
    const hasFilename = part.filename && part.filename.length > 0;
    const hasCid = !!contentIdHeader?.value;
    const isInline = contentDisposition?.value?.toLowerCase().startsWith("inline") ?? false;

    // Collect parts with a filename (regular attachments) or a Content-ID (CID inline images)
    if (hasFilename || hasCid) {
      results.push({
        filename: part.filename || contentIdHeader?.value?.replace(/[<>]/g, "") || "inline",
        mimeType: part.mimeType,
        size: part.body.size,
        gmailAttachmentId: part.body.attachmentId,
        contentId: contentIdHeader?.value?.replace(/[<>]/g, "") ?? null,
        isInline: isInline && !hasFilename,
      });
    }
  }

  if (part.parts) {
    for (const child of part.parts) {
      collectAttachments(child, results);
    }
  }
}

function decodeBase64Url(data: string): string {
  // Gmail uses URL-safe base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
  } catch {
    // Fallback for binary data
    return atob(base64);
  }
}
