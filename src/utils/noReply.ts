const NO_REPLY_PATTERNS = [
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "mailer-daemon",
];

/** Returns true if the address looks like a do-not-reply sender. */
export function isNoReplyAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  return NO_REPLY_PATTERNS.some((p) => local === p);
}
