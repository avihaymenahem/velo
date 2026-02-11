/**
 * Build an RFC 2822 email message and encode as base64url for the Gmail API.
 */
export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: string; // base64-encoded content
}

export interface EmailDraft {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  attachments?: EmailAttachment[];
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function buildAlternativePart(boundary: string, htmlBody: string): string[] {
  const textContent = htmlToPlainText(htmlBody);
  const lines: string[] = [];

  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("");
  lines.push(textContent);
  lines.push("");

  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("");
  lines.push(htmlBody);
  lines.push("");

  lines.push(`--${boundary}--`);
  return lines;
}

interface InlineImage {
  cid: string;
  mimeType: string;
  base64: string;
}

/**
 * Extract base64 data URLs from HTML and replace with cid: references.
 * Returns the modified HTML and extracted inline images.
 */
function extractInlineImages(html: string): { html: string; images: InlineImage[] } {
  const images: InlineImage[] = [];
  const processed = html.replace(
    /<img([^>]*)\ssrc="data:([^;]+);base64,([^"]+)"([^>]*)>/g,
    (_match, before: string, mime: string, data: string, after: string) => {
      const cid = `inline_${Date.now()}_${images.length}@velomail`;
      images.push({ cid, mimeType: mime, base64: data });
      return `<img${before} src="cid:${cid}"${after}>`;
    },
  );
  return { html: processed, images };
}

export function buildRawEmail(draft: EmailDraft): string {
  const lines: string[] = [
    `From: ${draft.from}`,
    `To: ${draft.to.join(", ")}`,
  ];

  if (draft.cc && draft.cc.length > 0) {
    lines.push(`Cc: ${draft.cc.join(", ")}`);
  }
  if (draft.bcc && draft.bcc.length > 0) {
    lines.push(`Bcc: ${draft.bcc.join(", ")}`);
  }

  lines.push(`Subject: ${draft.subject}`);
  lines.push(`MIME-Version: 1.0`);

  if (draft.inReplyTo) {
    lines.push(`In-Reply-To: ${draft.inReplyTo}`);
  }
  if (draft.references) {
    lines.push(`References: ${draft.references}`);
  }

  const { html: processedHtml, images: inlineImages } = extractInlineImages(draft.htmlBody);
  const hasAttachments = draft.attachments && draft.attachments.length > 0;
  const hasInlineImages = inlineImages.length > 0;

  if (hasAttachments || hasInlineImages) {
    const mixedBoundary = `----=_Mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const relatedBoundary = `----=_Related_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    if (hasAttachments) {
      lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
      lines.push("");

      lines.push(`--${mixedBoundary}`);
    }

    if (hasInlineImages) {
      lines.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`);
      lines.push("");

      lines.push(`--${relatedBoundary}`);
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push("");
      lines.push(...buildAlternativePart(altBoundary, processedHtml));
      lines.push("");

      // Inline image parts
      for (const img of inlineImages) {
        lines.push(`--${relatedBoundary}`);
        lines.push(`Content-Type: ${img.mimeType}`);
        lines.push("Content-Transfer-Encoding: base64");
        lines.push(`Content-ID: <${img.cid}>`);
        lines.push("Content-Disposition: inline");
        lines.push("");
        for (let i = 0; i < img.base64.length; i += 76) {
          lines.push(img.base64.slice(i, i + 76));
        }
        lines.push("");
      }
      lines.push(`--${relatedBoundary}--`);
    } else {
      // No inline images, just alternative
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push("");
      lines.push(...buildAlternativePart(altBoundary, processedHtml));
    }

    if (hasAttachments) {
      lines.push("");
      // Attachment parts
      for (const att of draft.attachments!) {
        lines.push(`--${mixedBoundary}`);
        lines.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`);
        lines.push("Content-Transfer-Encoding: base64");
        lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
        lines.push("");
        const raw = att.content;
        for (let i = 0; i < raw.length; i += 76) {
          lines.push(raw.slice(i, i + 76));
        }
        lines.push("");
      }
      lines.push(`--${mixedBoundary}--`);
    }
  } else {
    const altBoundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push("");
    lines.push(...buildAlternativePart(altBoundary, processedHtml));
  }

  return base64UrlEncode(lines.join("\r\n"));
}
