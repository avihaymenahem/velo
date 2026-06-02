import type { ThreadPrimaryState } from "@/services/agentic/types";

export const FOLLOW_UP_VIEW_IDS = [
  "today",
  "needs-reply",
  "waiting",
  "due-soon",
] as const;

export type FollowUpViewId = (typeof FOLLOW_UP_VIEW_IDS)[number];

export const FOLLOW_UP_WORK_STATE_MAP: Partial<Record<FollowUpViewId, ThreadPrimaryState[]>> = {
  today: ["needs_reply", "waiting"],
  "needs-reply": ["needs_reply"],
  waiting: ["waiting"],
};

export function isFollowUpViewId(label: string): label is FollowUpViewId {
  return (FOLLOW_UP_VIEW_IDS as readonly string[]).includes(label);
}
