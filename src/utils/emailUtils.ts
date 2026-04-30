/**
 * Normalize an email address for case-insensitive comparison.
 * Email addresses are case-insensitive per RFC 5321.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return "";
  const match = email.match(/<([^>]+)>/);
  const target = (match ? match[1] : email) || "";
  return target.toLowerCase().trim();
}
