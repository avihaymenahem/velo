export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "cancelled"] as const;
export const DEFAULT_RATE_LIMIT_MS = 1000;
export const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
  draft: "text-text-tertiary",
  scheduled: "text-accent",
  sending: "text-accent",
  sent: "text-success",
  cancelled: "text-danger",
};
