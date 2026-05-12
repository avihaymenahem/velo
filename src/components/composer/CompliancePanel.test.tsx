import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompliancePanel } from "./CompliancePanel";

vi.mock("@/services/compliance/ruleEngine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/compliance/ruleEngine")>();
  return {
    ...actual,
    detectJurisdiction: vi.fn(() => [{ id: "gdpr", code: "GDPR", name: "GDPR" }]),
    evaluateRules: vi.fn(() => ({
      profileId: "gdpr",
      score: 60,
      violations: [{ ruleId: "sig", severity: "error" as const, messageKey: "compliance.signatureRequired" }],
    })),
    aggregateResults: vi.fn(() => ({
      score: 60,
      violations: [{ ruleId: "sig", severity: "error" as const, messageKey: "compliance.signatureRequired" }],
    })),
  };
});

vi.mock("@/services/db/complianceProfiles", () => ({
  getActiveProfiles: vi.fn(() => Promise.resolve([])),
  insertCheck: vi.fn(() => Promise.resolve()),
}));

const composerPanelState = { subject: "Test Subject", setSubject: vi.fn(), getState: () => composerPanelState };
vi.mock("@/stores/composerStore", () => ({
  useComposerStore: Object.assign(
    (selector?: (s: Record<string, unknown>) => unknown) => {
      return selector ? selector(composerPanelState) : composerPanelState;
    },
    { getState: () => composerPanelState },
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("CompliancePanel", () => {
  const defaultProps = {
    editor: null,
    accountId: "acc-1",
    subject: "Test Subject",
    bodyHtml: "<p>Hello</p>",
    recipients: ["user@company.fr"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null when score is null (loading state)", () => {
    const { container } = render(<CompliancePanel {...defaultProps} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders score badge once loaded", async () => {
    render(<CompliancePanel {...defaultProps} />);
    const scoreText = await screen.findByText(/60\/100/);
    expect(scoreText).toBeTruthy();
  });

  it("shows red badge for score < 70", async () => {
    render(<CompliancePanel {...defaultProps} />);
    const scoreText = await screen.findByText(/60\/100/);
    expect(scoreText.className).toContain("text-danger");
  });

  it("shows green badge for score > 90", async () => {
    const ruleEngine = await import("@/services/compliance/ruleEngine");
    vi.mocked(ruleEngine.aggregateResults).mockReturnValue({
      score: 95,
      violations: [],
    });
    render(<CompliancePanel {...defaultProps} />);
    const scoreText = await screen.findByText(/95\/100/);
    expect(scoreText.className).toContain("text-success");
  });

  it("shows warning badge for score between 70 and 90", async () => {
    const ruleEngine = await import("@/services/compliance/ruleEngine");
    vi.mocked(ruleEngine.aggregateResults).mockReturnValue({
      score: 75,
      violations: [],
    });
    render(<CompliancePanel {...defaultProps} />);
    const scoreText = await screen.findByText(/75\/100/);
    expect(scoreText.className).toContain("text-warning");
  });

  it("shows violation count when violations exist", async () => {
    const ruleEngine = await import("@/services/compliance/ruleEngine");
    vi.mocked(ruleEngine.aggregateResults).mockReturnValue({
      score: 60,
      violations: [{ ruleId: "sig", severity: "error", messageKey: "compliance.signatureRequired" }],
    });
    render(<CompliancePanel {...defaultProps} />);
    const violationText = await screen.findByText(/compliance.violations/);
    expect(violationText).toBeTruthy();
  });

  it("shows compliance.allGood when no violations", async () => {
    const ruleEngine = await import("@/services/compliance/ruleEngine");
    vi.mocked(ruleEngine.aggregateResults).mockReturnValue({
      score: 100,
      violations: [],
    });
    render(<CompliancePanel {...defaultProps} />);
    const allGood = await screen.findByText("compliance.allGood");
    expect(allGood).toBeTruthy();
  });
});
