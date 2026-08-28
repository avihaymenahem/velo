const NO_REPLY_PATTERNS = [
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "mailer-daemon",
];

/**
 * Local-part prefixes that indicate an automated/unmailable sender
 * (real ones often carry suffixes, e.g. "no-reply-abc123@", "bounce+xyz@").
 */
export const UNMAILABLE_PREFIXES = [
  ...NO_REPLY_PATTERNS,
  "postmaster",
  "bounce",
  "bounces",
] as const;

/** Returns true if the address looks like a do-not-reply sender. */
export function isNoReplyAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  return NO_REPLY_PATTERNS.some((p) => local === p);
}

/**
 * Returns true if the address looks automated/unmailable (prefix match on the
 * local part, unlike isNoReplyAddress's exact match).
 */
export function isUnmailableAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  return UNMAILABLE_PREFIXES.some((p) => local.startsWith(p));
}
