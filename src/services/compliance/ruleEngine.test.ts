import { describe, it, expect } from "vitest";
import { detectJurisdiction, evaluateRules, aggregateResults } from "./ruleEngine";
import type { ComplianceProfile, ComplianceCheckContext, ComplianceRule } from "./types";

const moroccoProfile: ComplianceProfile = {
  id: "morocco",
  code: "MA",
  name: "Morocco",
  description: "Morocco data protection",
  regionHint: ".ma",
  isActive: true,
  isDefault: false,
  rules: [],
};

const gdprProfile: ComplianceProfile = {
  id: "gdpr",
  code: "EU",
  name: "GDPR",
  description: "General Data Protection Regulation",
  regionHint: ".fr,.de,.es,.it",
  isActive: true,
  isDefault: false,
  rules: [],
};

describe("detectJurisdiction", () => {
  it("detects Morocco profile for .ma TLD", () => {
    const result = detectJurisdiction(
      [{ email: "user@company.ma" }],
      [moroccoProfile, gdprProfile],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("MA");
  });

  it("detects GDPR profile for .fr TLD", () => {
    const result = detectJurisdiction(
      [{ email: "user@company.fr" }],
      [moroccoProfile, gdprProfile],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("EU");
  });

  it("returns multiple profiles when multiple recipients match", () => {
    const result = detectJurisdiction(
      [{ email: "user@company.ma" }, { email: "user@company.fr" }],
      [moroccoProfile, gdprProfile],
    );
    expect(result).toHaveLength(2);
  });

  it("skips inactive profiles", () => {
    const inactive: ComplianceProfile = { ...moroccoProfile, isActive: false };
    const result = detectJurisdiction(
      [{ email: "user@company.ma" }],
      [inactive],
    );
    expect(result).toHaveLength(0);
  });
});

describe("evaluateRules", () => {
  const baseContext: ComplianceCheckContext = {
    subject: "Test",
    bodyHtml: "<p>Hello</p>",
    senderEmail: "sender@test.com",
    recipients: [{ email: "recip@test.com" }],
    hasSignature: true,
    hasUnsubscribe: true,
    hasAttachments: false,
  };

  function makeRule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
    return {
      id: "rule-1",
      type: "signature_required",
      severity: "error",
      messageKey: "violation.signatureRequired",
      ...overrides,
    };
  }

  it("returns violations when signature is missing", () => {
    const profile: ComplianceProfile = {
      id: "p1", code: "C1", name: "Test", description: null,
      regionHint: null, isActive: true, isDefault: false,
      rules: [makeRule({ type: "signature_required" })],
    };
    const result = evaluateRules(profile, { ...baseContext, hasSignature: false });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.ruleId).toBe("rule-1");
    expect(result.violations[0]!.severity).toBe("error");
  });

  it("returns no violations when all rules pass", () => {
    const profile: ComplianceProfile = {
      id: "p1", code: "C1", name: "Test", description: null,
      regionHint: null, isActive: true, isDefault: false,
      rules: [makeRule({ type: "signature_required" })],
    };
    const result = evaluateRules(profile, { ...baseContext, hasSignature: true });
    expect(result.violations).toHaveLength(0);
  });

  it("detects tone_check violation for ALL-CAPS subject", () => {
    const profile: ComplianceProfile = {
      id: "p1", code: "C1", name: "Test", description: null,
      regionHint: null, isActive: true, isDefault: false,
      rules: [makeRule({ type: "tone_check", severity: "warning" })],
    };
    const result = evaluateRules(profile, {
      ...baseContext,
      subject: "THIS IS AN URGENT MESSAGE ABOUT YOUR ACCOUNT",
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.fixAction).toBe("fix_subject_case");
  });

  it("detects data_minimization violation for credit card numbers", () => {
    const profile: ComplianceProfile = {
      id: "p1", code: "C1", name: "Test", description: null,
      regionHint: null, isActive: true, isDefault: false,
      rules: [makeRule({ type: "data_minimization", severity: "error" })],
    };
    const result = evaluateRules(profile, {
      ...baseContext,
      bodyHtml: "<p>My card is 4111111111111111</p>",
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.fixAction).toBe("remove_sensitive_data");
  });

  it("detects attachment_mentioned violation", () => {
    const profile: ComplianceProfile = {
      id: "p1", code: "C1", name: "Test", description: null,
      regionHint: null, isActive: true, isDefault: false,
      rules: [makeRule({ type: "attachment_mentioned", severity: "warning" })],
    };
    const result = evaluateRules(profile, {
      ...baseContext,
      bodyHtml: "<p>Please find attached the report</p>",
      hasAttachments: false,
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.fixAction).toBe("add_attachment");
  });

  it("does not flag attachment_mentioned when attachments exist", () => {
    const profile: ComplianceProfile = {
      id: "p1", code: "C1", name: "Test", description: null,
      regionHint: null, isActive: true, isDefault: false,
      rules: [makeRule({ type: "attachment_mentioned", severity: "warning" })],
    };
    const result = evaluateRules(profile, {
      ...baseContext,
      bodyHtml: "<p>Please find attached</p>",
      hasAttachments: true,
    });
    expect(result.violations).toHaveLength(0);
  });
});

describe("aggregateResults", () => {
  it("returns score 100 with no violations when empty", () => {
    const result = aggregateResults([]);
    expect(result.score).toBe(100);
    expect(result.violations).toHaveLength(0);
  });

  it("uses the minimum score across results", () => {
    const result = aggregateResults([
      { profileId: "p1", score: 80, violations: [] },
      { profileId: "p2", score: 50, violations: [] },
    ]);
    expect(result.score).toBe(50);
  });

  it("deduplicates violations by ruleId:severity:messageKey", () => {
    const result = aggregateResults([
      {
        profileId: "p1", score: 70,
        violations: [{ ruleId: "r1", severity: "error", messageKey: "vk" }],
      },
      {
        profileId: "p2", score: 70,
        violations: [{ ruleId: "r1", severity: "error", messageKey: "vk" }],
      },
    ]);
    expect(result.violations).toHaveLength(1);
  });
});
