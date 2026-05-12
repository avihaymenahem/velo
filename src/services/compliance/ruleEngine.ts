import type {
  ComplianceProfile,
  ComplianceRule,
  ComplianceViolation,
  ComplianceCheckResult,
  ComplianceCheckContext,
} from "./types";

function getTld(email: string): string {
  const parts = email.split("@");
  if (parts.length < 2) return "";
  const domain = parts[1]!.toLowerCase().trim();
  const dotIdx = domain.lastIndexOf(".");
  if (dotIdx < 0) return "";
  return domain.slice(dotIdx);
}

function getDomain(email: string): string {
  const parts = email.split("@");
  if (parts.length < 2) return "";
  return parts[1]!.toLowerCase().trim();
}

export function detectJurisdiction(
  recipients: { email: string }[],
  profiles: ComplianceProfile[],
): ComplianceProfile[] {
  const domains = recipients.map((r) => {
    const tld = getTld(r.email);
    const domain = getDomain(r.email);
    return { tld, domain };
  });

  const matched = new Set<string>();
  const result: ComplianceProfile[] = [];

  for (const profile of profiles) {
    if (!profile.isActive) continue;
    if (!profile.regionHint) {
      if (!matched.has(profile.id)) {
        matched.add(profile.id);
        result.push(profile);
      }
      continue;
    }

    const hints = profile.regionHint.split(",").map((h) => h.trim().toLowerCase());
    for (const { tld, domain } of domains) {
      if (hints.some((h) => tld.endsWith(h) || domain.endsWith(h))) {
        if (!matched.has(profile.id)) {
          matched.add(profile.id);
          result.push(profile);
        }
        break;
      }
    }
  }

  return result;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function evaluateRule(
  rule: ComplianceRule,
  context: ComplianceCheckContext,
): ComplianceViolation | null {
  const bodyText = stripHtml(context.bodyHtml);

  switch (rule.type) {
    case "signature_required": {
      if (!context.hasSignature) {
        return {
          ruleId: rule.id,
          severity: rule.severity,
          messageKey: rule.messageKey,
          field: rule.config?.field,
          fixAction: "add_signature",
        };
      }
      if (rule.config?.minWords && rule.config.minWords > 0) {
        const sigWords = bodyText.split(/\s+/).length;
        if (sigWords < rule.config.minWords) {
          return {
            ruleId: rule.id,
            severity: rule.severity,
            messageKey: rule.messageKey,
            field: rule.config?.field,
            fixAction: "add_signature",
          };
        }
      }
      return null;
    }

    case "unsubscribe_required": {
      if (!context.hasUnsubscribe) {
        return {
          ruleId: rule.id,
          severity: rule.severity,
          messageKey: rule.messageKey,
          fixAction: "add_unsubscribe",
        };
      }
      return null;
    }

    case "disclaimer_required": {
      const lowerBody = bodyText.toLowerCase();
      const keywords = ["disclaimer", "confidential", "privileged", "lawful basis", "legal"];
      const found = keywords.some((kw) => lowerBody.includes(kw));
      if (!found) {
        return {
          ruleId: rule.id,
          severity: rule.severity,
          messageKey: rule.messageKey,
          fixAction: "add_disclaimer",
        };
      }
      return null;
    }

    case "tone_check": {
      const subject = context.subject;
      if (subject && subject === subject.toUpperCase() && subject.length > 10) {
        return {
          ruleId: rule.id,
          severity: rule.severity,
          messageKey: rule.messageKey,
          fixAction: "fix_subject_case",
        };
      }
      return null;
    }

    case "data_minimization": {
      const lowerBody = bodyText.toLowerCase();
      const patterns = [
        /\b\d{16,19}\b/, // credit card
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN
        /\b(?:\d[ -]*?){13,19}\b/, // generic long numbers
      ];
      for (const pat of patterns) {
        if (pat.test(lowerBody)) {
          return {
            ruleId: rule.id,
            severity: rule.severity,
            messageKey: rule.messageKey,
            fixAction: "remove_sensitive_data",
          };
        }
      }
      return null;
    }

    case "retention_notice": {
      const lowerBody = bodyText.toLowerCase();
      const keywords = ["retain", "retention", "delete after", "keep for", "data retention"];
      const found = keywords.some((kw) => lowerBody.includes(kw));
      if (!found) {
        return {
          ruleId: rule.id,
          severity: rule.severity,
          messageKey: rule.messageKey,
          fixAction: "add_retention_notice",
        };
      }
      return null;
    }

    case "custom_regex": {
      if (!rule.config?.regex) return null;
      try {
        const re = new RegExp(rule.config.regex, "i");
        const textToSearch = `${context.subject} ${bodyText}`;
        if (!re.test(textToSearch)) {
          return {
            ruleId: rule.id,
            severity: rule.severity,
            messageKey: rule.messageKey,
            field: rule.config?.field,
            fixAction: "add_missing_content",
          };
        }
      } catch {
        // invalid regex - skip
      }
      return null;
    }

    case "attachment_mentioned": {
      const lowerBody = bodyText.toLowerCase();
      const mentionsAttachment =
        lowerBody.includes("attachment") ||
        lowerBody.includes("attached") ||
        lowerBody.includes("enclosed") ||
        lowerBody.includes("see attached") ||
        lowerBody.includes("please find");
      if (mentionsAttachment && !context.hasAttachments) {
        return {
          ruleId: rule.id,
          severity: rule.severity,
          messageKey: rule.messageKey,
          fixAction: "add_attachment",
        };
      }
      return null;
    }

    default:
      return null;
  }
}

export function evaluateRules(
  profile: ComplianceProfile,
  context: ComplianceCheckContext,
): ComplianceCheckResult {
  const violations: ComplianceViolation[] = [];

  for (const rule of profile.rules) {
    const violation = evaluateRule(rule, context);
    if (violation) {
      violations.push(violation);
    }
  }

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;
  const infoCount = violations.filter((v) => v.severity === "info").length;

  const deduction = Math.min(errorCount * 30 + warningCount * 10 + infoCount * 5, 100);
  const score = Math.max(0, 100 - deduction);

  return {
    profileId: profile.id,
    score,
    violations,
  };
}

export function aggregateResults(
  results: ComplianceCheckResult[],
): { score: number; violations: ComplianceViolation[] } {
  if (results.length === 0) {
    return { score: 100, violations: [] };
  }

  const allViolations = results.flatMap((r) => r.violations);
  const seen = new Set<string>();
  const uniqueViolations: ComplianceViolation[] = [];
  for (const v of allViolations) {
    const key = `${v.ruleId}:${v.severity}:${v.messageKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueViolations.push(v);
    }
  }

  const score = Math.min(...results.map((r) => r.score));

  return { score, violations: uniqueViolations };
}
