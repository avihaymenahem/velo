export type ThreadPrimaryState =
  | "unclassified"
  | "needs_reply"
  | "waiting"
  | "committed"
  | "decision_needed"
  | "risk"
  | "opportunity"
  | "can_archive"
  | "done";

export type WorkPriority = "low" | "normal" | "high" | "urgent";
export type RiskLevel = "low" | "medium" | "high";
export type WorkStateSource =
  | "manual"
  | "rule"
  | "agent_suggested"
  | "agent_approved"
  | "system";

export type AgentActionLevel = "observe" | "suggest" | "prepare" | "act";
export type AgentActionStatus =
  | "suggested"
  | "prepared"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "expired";

export type AgentActionKind =
  | "suggest_work_state"
  | "suggest_archive"
  | "suggest_waiting"
  | "suggest_commitment"
  | "suggest_decision"
  | "prepare_reply"
  | "prepare_follow_up"
  | "create_commitment"
  | "create_waiting"
  | "create_decision"
  | "archive_thread"
  | "mark_done";
