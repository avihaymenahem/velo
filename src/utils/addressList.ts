export interface ParsedAddress {
  email: string;
  name: string | null;
}

/**
 * Parse an RFC-5322 address-list header into individual addresses.
 *
 * Handles the forms produced by real mail headers:
 *   a@b.com
 *   Alice Smith <alice@example.com>
 *   "Doe, John" <john@example.com>, bare@example.com
 *   undisclosed-recipients:;  (group syntax — yields nothing)
 *
 * Emails are lowercased and trimmed; display names keep their original
 * casing with surrounding quotes stripped and escaped quotes unescaped.
 */
export function parseAddressList(header: string | null | undefined): ParsedAddress[] {
  if (!header) return [];

  // Split on commas that are outside double quotes and outside angle brackets.
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i]!;
    if (ch === '"' && header[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && ch === "<") {
      inAngle = true;
      current += ch;
    } else if (!inQuotes && ch === ">") {
      inAngle = false;
      current += ch;
    } else if (ch === "," && !inQuotes && !inAngle) {
      tokens.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  tokens.push(current);

  const result: ParsedAddress[] = [];
  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) continue;

    let email: string;
    let name: string | null = null;

    const angleStart = token.lastIndexOf("<");
    const angleEnd = token.lastIndexOf(">");
    if (angleStart !== -1 && angleEnd > angleStart) {
      email = token.slice(angleStart + 1, angleEnd).trim().toLowerCase();
      name = token.slice(0, angleStart).trim();
      if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
        name = name.slice(1, -1).replace(/\\"/g, '"');
      }
      name = name.trim() || null;
    } else {
      email = token.trim().toLowerCase();
    }

    // Group syntax like "undisclosed-recipients:;" — a colon with no address.
    if (!email || email.includes(":")) continue;
    const at = email.indexOf("@");
    if (at < 1 || at === email.length - 1) continue;
    if (/\s/.test(email)) continue;

    result.push({ email, name });
  }
  return result;
}
