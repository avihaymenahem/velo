/**
 * Transforms raw "---------- Forwarded message ---------" blocks and reply
 * attribution lines ("On DATE, NAME <email> wrote:") into styled collapsible
 * components, for both plain-text and HTML emails.
 *
 * CSS/JS constants are injected into the iframe srcdoc by EmailRenderer.
 */

const HEADER_KEYS = new Set([
  "from", "date", "subject", "to", "cc", "bcc", "reply-to",
  "sent", "mailed-by", "signed-by", "delivered-to",
]);

/** Maps locale header keys → canonical English key checked against HEADER_KEYS. */
const LOCALE_HEADER_MAP: Record<string, string> = {
  // Italian
  "da": "from", "inviato": "sent", "data": "date",
  "a": "to", "oggetto": "subject",
  // French
  "de": "from", "envoyé": "sent", "à": "to", "objet": "subject",
  // Spanish
  "enviado": "sent", "para": "to", "asunto": "subject",
  // German
  "von": "from", "gesendet": "sent", "an": "to", "betreff": "subject",
};

const CHEVRON = `<svg class="fw-chv" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

export const FW_CSS = `
.fw-blk{margin:10px 0;overflow:hidden;border:1px solid rgba(99,102,241,.2);border-left:3px solid #6366f1;border-radius:0 6px 6px 0}
.fw-hd{display:flex;align-items:center;gap:6px;padding:7px 10px;cursor:pointer;user-select:none;background:rgba(99,102,241,.07);font-size:11px;font-weight:600;color:#6366f1;font-family:system-ui,-apple-system,sans-serif;line-height:1.4}
.fw-hd:hover{background:rgba(99,102,241,.12)}
.fw-chv{transition:transform .15s;flex-shrink:0}
.fw-blk:not(.fw-open) .fw-chv{transform:rotate(-90deg)}
.fw-snip{color:#9ca3af;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;padding-left:4px}
.fw-meta{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;padding:6px 10px;font-size:11px;background:rgba(99,102,241,.02);border-bottom:1px solid rgba(99,102,241,.12);font-family:system-ui,-apple-system,sans-serif}
.fw-lbl{color:#9ca3af;font-weight:500;white-space:nowrap;padding-top:1px}
.fw-val{color:#374151;word-break:break-word}
.fw-blk:not(.fw-open) .fw-meta{display:none}
`;

export const FW_DARK_CSS = `
.fw-blk{border-color:rgba(129,140,248,.25);border-left-color:#818cf8}
.fw-hd{color:#818cf8;background:rgba(99,102,241,.12)}
.fw-hd:hover{background:rgba(99,102,241,.18)}
.fw-meta{background:rgba(99,102,241,.05);border-bottom-color:rgba(129,140,248,.2)}
.fw-lbl{color:#6b7280}.fw-val{color:#d1d5db}
`;

export const FW_JS = `document.querySelectorAll('.fw-hd').forEach(function(h){h.addEventListener('click',function(){h.closest('.fw-blk').classList.toggle('fw-open')})});`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function normalizeKey(raw: string): string {
  const low = raw.toLowerCase();
  return LOCALE_HEADER_MAP[low] ?? low;
}

function parseHeaderLine(line: string): [string, string] | null {
  const i = line.indexOf(":");
  // Allow i >= 1 so single-char locale keys like "A:" (Italian To) are accepted
  if (i < 1 || i > 20) return null;
  const raw = line.slice(0, i).trim();
  const norm = normalizeKey(raw);
  if (!HEADER_KEYS.has(norm)) return null;
  const val = line.slice(i + 1).trim();
  // Display the normalized English key so the block is always in English
  return val ? [norm.charAt(0).toUpperCase() + norm.slice(1), val] : null;
}

function buildBlock(headers: Array<[string, string]>, label = "Forwarded message"): string {
  if (!headers.length) return "";
  const from = headers.find(([k]) => k.toLowerCase() === "from")?.[1] ?? "";
  const subject = headers.find(([k]) => k.toLowerCase() === "subject")?.[1] ?? "";
  const snip = [from, subject ? `· ${subject}` : ""].filter(Boolean).join(" ");
  const rows = headers
    .map(([k, v]) => `<div class="fw-lbl">${k}</div><div class="fw-val">${v}</div>`)
    .join("");
  return (
    `<div class="fw-blk fw-open">` +
    `<div class="fw-hd">${CHEVRON}<span>${label}</span>` +
    (snip ? `<span class="fw-snip">${snip}</span>` : "") +
    `</div><div class="fw-meta">${rows}</div></div>`
  );
}

// ---------------------------------------------------------------------------
// Reply attribution: "On DATE, NAME <email> wrote:" and locale variants
// ---------------------------------------------------------------------------

interface Attribution {
  name: string;
  email: string;
  date: string;
}

/**
 * Matches locale-aware reply attribution lines:
 *   English:    "On Mon, 20 May 2025 at 10:08, John Doe <j@x.com> wrote:"
 *   Italian:    "Il 18 mag 2026, 15:51 +0200, Studio Fraietta <i@x.com>, ha scritto:"
 *   French:     "Le 20 mai 2025 à 10:08, Jean Dupont <j@x.com> a écrit :"
 *   Spanish:    "El 20 de mayo de 2025, 10:08, Juan <j@x.com> escribió:"
 *   Portuguese: "Em 20 de maio de 2025, João <j@x.com> escreveu:"
 *
 * Strategy: greedy (.+) before the last ", NAME <email>" so date ends at the
 * rightmost comma+space before the sender name.
 */
const ATTRIB_RE =
  /^(?:on|il|le|am|el|em)\s+(.+),\s+(.+?)\s+<([^>@\s]+@[^>\s]+)>\s*,?\s*(?:wrote|ha scritto|a [eé]crit|schrieb|escribi[oó]|escreveu)\s*:[ \t]*$/i;

function parseAttribution(text: string): Attribution | null {
  const m = text.trim().match(ATTRIB_RE);
  if (!m) return null;
  return { date: (m[1] ?? "").trim(), name: (m[2] ?? "").trim(), email: (m[3] ?? "").trim() };
}

function buildAttributionBlock(attr: Attribution): string {
  const headers: Array<[string, string]> = [
    ["From", `${esc(attr.name)} &lt;${esc(attr.email)}&gt;`],
  ];
  if (attr.date) headers.push(["Date", esc(attr.date)]);
  return buildBlock(headers, "In reply to");
}

function innerToPlain(inner: string): string {
  return decodeEntities(
    inner.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
  );
}

// ---------------------------------------------------------------------------
// Plain-text transform
// ---------------------------------------------------------------------------

const PRE = (s: string) =>
  s ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${esc(s)}</pre>` : "";

// Source string for attribution detection in plain text (recreated per call to reset lastIndex)
const ATTRIB_LINE_SRC =
  /^[ \t]*(?:on|il|le|am|el|em)\s+.+,\s+.+<[^>]+@[^>]+>.*?(?:wrote|ha scritto|a [eé]crit|schrieb|escribi[oó]|escreveu)\s*:[ \t]*$/.source;

function segToHtml(seg: string): string {
  if (!seg) return "";
  const re = new RegExp(ATTRIB_LINE_SRC, "gim");
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    parts.push(PRE(seg.slice(last, m.index)));
    const attr = parseAttribution(m[0].trim());
    parts.push(attr ? buildAttributionBlock(attr) : PRE(m[0]));
    last = m.index + m[0].length;
  }
  parts.push(PRE(seg.slice(last)));
  return parts.join("");
}

/**
 * Transforms forwarded blocks in plain-text emails.
 * Returns HTML with <pre> segments interleaved with fw-blk components.
 */
export function transformPlainText(text: string): string {
  // Matches various separator formats used by different clients:
  // Gmail/Apple: "---------- Forwarded message ---------"
  // Outlook:     "-----Original Message-----" / "-----Original Email-----"
  // Thunderbird: "-------- Forwarded Message --------"
  // Apple Mail:  "Begin forwarded message:"
  const FW_RE =
    /(?:[ \t]*-{3,}[ \t]*(?:Forwarded\s+(?:message|mail|email)|Original\s+(?:message|mail|email)|Messaggio\s+inoltrato|Message\s+(?:transmis|transf[eé]r[eé])|Mensaje\s+reenviado)[ \t]*-{3,}[ \t]*|Begin\s+forwarded\s+message:[ \t]*)\r?\n\r?\n?((?:[ \t]*(?:From|Da|De|Von|Date|Data|Inviato|Sent|Gesendet|Subject|Oggetto|Objet|Asunto|Betreff|To|A|An|Cc|Bcc|Reply-To)[ \t]*:[^\n]+\r?\n?)+)/gi;

  const segments: string[] = [];
  const blocks: Array<Array<[string, string]>> = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = FW_RE.exec(text)) !== null) {
    segments.push(text.slice(last, m.index));
    const headers: Array<[string, string]> = (m[1] ?? "")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => parseHeaderLine(line.trim()))
      .filter((h): h is [string, string] => h !== null)
      .map(([k, v]) => [k, esc(v)]);
    blocks.push(headers);
    last = m.index + m[0].length;
  }
  segments.push(text.slice(last));

  if (!blocks.length) {
    // No forwarded blocks — still scan for attribution lines
    return segToHtml(text);
  }

  return segments
    .map((seg, i) => {
      const block = i < blocks.length ? buildBlock(blocks[i] ?? []) : "";
      return segToHtml(seg) + block;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// HTML transform
// ---------------------------------------------------------------------------

function parseHtmlHeaders(block: string): Array<[string, string]> {
  const text = block
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ");

  return text
    .split(/\n+/)
    .filter(Boolean)
    .map((line): [string, string] | null => {
      const trimmed = line.trim();
      const i = trimmed.indexOf(":");
      // Allow i >= 1 for single-char locale keys like "A:" (Italian To)
      if (i < 1 || i > 20) return null;
      const raw = trimmed.slice(0, i).trim();
      const norm = normalizeKey(raw);
      if (!HEADER_KEYS.has(norm)) return null;
      const val = trimmed.slice(i + 1).trim();
      if (!val) return null;
      return [norm.charAt(0).toUpperCase() + norm.slice(1), val];
    })
    .filter((h): h is [string, string] => h !== null);
}

const WROTE_RE = /(?:wrote|ha scritto|a [eé]crit|schrieb|escribi[oó]|escreveu)\s*:/i;

/**
 * Transforms forwarded blocks in HTML emails.
 * Handles Gmail's .gmail_attr div, inline <br>-separated header lines,
 * Outlook <hr>-separated blocks, and locale-aware reply attribution lines.
 */
export function transformHtml(html: string): string {
  // Case 1: Gmail .gmail_attr wrapper div
  // Handles both forwarded header blocks (From:/Date:/Subject:) and
  // reply attributions ("Il DATE, NAME <email>, ha scritto:")
  html = html.replace(
    /<div[^>]*class="[^"]*gmail_attr[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    (full, inner) => {
      const headers = parseHtmlHeaders(inner);
      if (headers.some(([k]) => k.toLowerCase() === "from")) {
        return buildBlock(headers);
      }
      const attr = parseAttribution(innerToPlain(inner));
      if (attr) return buildAttributionBlock(attr);
      return full;
    },
  );

  // Case 2: Inline dashed separator + <br>-separated header lines (various clients)
  // Handles: "Forwarded message", "Original Message", "Messaggio inoltrato", etc.
  html = html.replace(
    /-{3,}\s*(?:Forwarded\s+(?:message|mail|email)|Original\s+(?:message|mail|email)|Messaggio\s+inoltrato|Message\s+(?:transmis|transf[eé]r[eé])|Mensaje\s+reenviado)\s*-{3,}(?:<br\s*\/?>|<\/[a-z]+>|\s)*?((?:(?:From|Da|De|Von|Date|Data|Inviato|Sent|Gesendet|Subject|Oggetto|Objet|Asunto|Betreff|To|A|An|Cc|Bcc|Reply-To)\s*:[^<\n]+(?:<br\s*\/?>)?\s*)+)/gi,
    (full, headerBlock) => {
      const headers = parseHtmlHeaders(headerBlock);
      return headers.length ? buildBlock(headers) : full;
    },
  );

  // Case 3: Outlook-style <hr> separator followed by a bold key/value header paragraph.
  // Outlook wraps forward/reply headers in <p> or <div> with <b>Key:</b> Value <br> pairs.
  html = html.replace(
    /<hr[^>]*\/?>\s*<(p|div)([^>]*)>((?:(?:<b>|<strong>)[^<]+(?:<\/b>|<\/strong>)[^<]*(?:<br\s*\/?>)?[ \t\r\n]*){2,})<\/\1>/gi,
    (full, _tag, _attrs, headerBlock) => {
      const headers = parseHtmlHeaders(headerBlock);
      if (headers.length < 2 || !headers.some(([k]) => k.toLowerCase() === "from")) return full;
      return buildBlock(headers, "Original message");
    },
  );

  // Case 5: Outlook body metadata block — multi-line bold key/value <p> WITHOUT <hr>.
  // Outlook embeds the outer email's Da/Inviato/A/Oggetto at the top of the forwarded body.
  // Requires 3+ recognized headers AND a From/Da equivalent to avoid false positives.
  html = html.replace(
    /<p[^>]*>((?:(?:<b>|<strong>)[^<]+(?:<\/b>|<\/strong>)[^<]*(?:<br\s*\/?>)?[ \t\r\n]*){3,})<\/p>/gi,
    (full, headerBlock) => {
      const headers = parseHtmlHeaders(headerBlock);
      if (headers.length < 3 || !headers.some(([k]) => k.toLowerCase() === "from")) return full;
      return buildBlock(headers);
    },
  );

  // Case 4: Attribution line in a bare <p> or <div> element.
  // Covers Apple Mail (<div>), webmail, and clients that don't use gmail_attr.
  // Guards: must contain "ha scritto:" / "wrote:" etc., must NOT contain nested block
  // elements (to avoid matching large container divs), and must be ≤ 500 chars.
  html = html.replace(
    /<(p|div)[^>]*>([\s\S]{15,500}?)<\/\1>/gi,
    (full, _tag, inner) => {
      if (!WROTE_RE.test(inner)) return full;
      // Skip if inner contains nested block elements — this is a container, not a leaf
      if (/<\/(?:div|p|table|ul|ol|li|blockquote|h[1-6])/i.test(inner)) return full;
      const attr = parseAttribution(innerToPlain(inner));
      return attr ? buildAttributionBlock(attr) : full;
    },
  );

  return html;
}
