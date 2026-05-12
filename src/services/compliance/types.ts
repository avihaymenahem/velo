export type ComplianceRuleType =
  | "signature_required"
  | "unsubscribe_required"
  | "disclaimer_required"
  | "tone_check"
  | "data_minimization"
  | "retention_notice"
  | "custom_regex"
  | "attachment_mentioned";

export type RuleSeverity = "error" | "warning" | "info";

export interface ComplianceRule {
  id: string;
  type: ComplianceRuleType;
  severity: RuleSeverity;
  messageKey: string;
  config?: {
    field?: string;
    regex?: string;
    minWords?: number;
    domains?: string[];
  };
}

export interface ComplianceProfile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  regionHint: string | null;
  rules: ComplianceRule[];
  isActive: boolean;
  isDefault: boolean;
}

export interface ComplianceViolation {
  ruleId: string;
  severity: RuleSeverity;
  messageKey: string;
  field?: string;
  fixAction?: string;
}

export interface ComplianceCheckResult {
  profileId: string;
  score: number;
  violations: ComplianceViolation[];
}

export interface ComplianceCheckContext {
  subject: string;
  bodyHtml: string;
  senderEmail: string;
  recipients: { email: string; displayName?: string }[];
  hasSignature: boolean;
  hasUnsubscribe: boolean;
  hasAttachments: boolean;
}
