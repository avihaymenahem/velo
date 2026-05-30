export interface ParsedEmail {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  inReplyTo: string | null;
}

export function parseRawEmail(base64url: string): ParsedEmail {
  const empty: ParsedEmail = { from: "", to: [], cc: [], subject: "", bodyHtml: "", inReplyTo: null };
  try {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    const headerEnd = raw.indexOf("\r\n\r\n");
    const headerSection = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
    const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : "";

    const headers: Record<string, string> = {};
    let currentKey = "";
    for (const line of headerSection.split("\r\n")) {
      if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey) {
        headers[currentKey] += " " + line.trim();
      } else {
        const colon = line.indexOf(":");
        if (colon > 0) {
          currentKey = line.slice(0, colon).toLowerCase();
          headers[currentKey] = line.slice(colon + 1).trim();
        }
      }
    }

    const splitAddresses = (h: string | undefined): string[] =>
      h ? h.split(",").map((a) => a.trim()).filter(Boolean) : [];

    return {
      from: headers["from"] ?? "",
      to: splitAddresses(headers["to"]),
      cc: splitAddresses(headers["cc"]),
      subject: headers["subject"] ?? "",
      bodyHtml: extractHtmlPart(body, headers["content-type"] ?? ""),
      inReplyTo: headers["in-reply-to"] ?? null,
    };
  } catch {
    return empty;
  }
}

function extractHtmlPart(body: string, contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.startsWith("text/html")) return body.trim();
  if (ct.startsWith("text/plain")) return "";

  const boundaryMatch = /boundary="([^"]+)"/i.exec(contentType);
  if (!boundaryMatch) return body.trim();

  const boundary = boundaryMatch[1] ?? "";
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`--${escaped}(?:--)?`));

  for (const part of parts) {
    if (!part.trim() || part.trim() === "--") continue;
    const partEnd = part.indexOf("\r\n\r\n");
    if (partEnd < 0) continue;
    const partHeaders = part.slice(0, partEnd);
    const partBody = part.slice(partEnd + 4);
    const partCt = /Content-Type:\s*([^\r\n]+)/i.exec(partHeaders)?.[1] ?? "";
    const partCtLow = partCt.toLowerCase();

    if (partCtLow.startsWith("text/html")) return partBody.trim();
    if (partCtLow.startsWith("multipart/")) {
      const nested = extractHtmlPart(partBody, partCt);
      if (nested) return nested;
    }
  }
  return "";
}
