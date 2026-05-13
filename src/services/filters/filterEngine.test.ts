import { describe, it, expect, vi, beforeEach } from "vitest";
import { messageMatchesFilter, computeFilterActions, evaluateScoredConditions, evaluateChainedRules } from "./filterEngine";
import type { FilterCriteria, FilterActions } from "../db/filters";
import { createMockParsedMessage } from "@/test/mocks";

vi.mock("../db/filters", async () => {
  const actual = await vi.importActual("../db/filters");
  return {
    ...actual,
    getFilterConditionsForRule: vi.fn(),
    logFilterMatch: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("messageMatchesFilter", () => {
  it("matches from criteria (case-insensitive)", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { from: "alice" };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("matches from name", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { from: "Smith" };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("does not match wrong from", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { from: "charlie" };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });

  it("matches to criteria", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { to: "bob" };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("does not match wrong to", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { to: "charlie" };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });

  it("matches subject criteria", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { subject: "project" };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("does not match wrong subject", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { subject: "invoice" };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });

  it("matches body criteria in text", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { body: "hello from" };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("matches hasAttachment criteria", () => {
    const msg = createMockParsedMessage({ hasAttachments: true });
    const criteria: FilterCriteria = { hasAttachment: true };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("does not match hasAttachment when no attachments", () => {
    const msg = createMockParsedMessage({ hasAttachments: false });
    const criteria: FilterCriteria = { hasAttachment: true };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });

  it("ANDs multiple criteria together", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { from: "alice", subject: "project" };
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("fails AND when one criterion misses", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = { from: "alice", subject: "invoice" };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });

  it("matches with empty criteria (matches everything)", () => {
    const msg = createMockParsedMessage();
    const criteria: FilterCriteria = {};
    expect(messageMatchesFilter(msg, criteria)).toBe(true);
  });

  it("handles null fromAddress gracefully", () => {
    const msg = createMockParsedMessage({ fromAddress: null, fromName: null });
    const criteria: FilterCriteria = { from: "alice" };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });

  it("handles null toAddresses gracefully", () => {
    const msg = createMockParsedMessage({ toAddresses: null });
    const criteria: FilterCriteria = { to: "bob" };
    expect(messageMatchesFilter(msg, criteria)).toBe(false);
  });
});

describe("computeFilterActions", () => {
  it("returns empty result for empty actions", () => {
    const result = computeFilterActions({});
    expect(result.addLabelIds).toEqual([]);
    expect(result.removeLabelIds).toEqual([]);
    expect(result.markRead).toBe(false);
    expect(result.star).toBe(false);
  });

  it("adds label", () => {
    const actions: FilterActions = { applyLabel: "Label_123" };
    const result = computeFilterActions(actions);
    expect(result.addLabelIds).toContain("Label_123");
  });

  it("archives (removes INBOX)", () => {
    const actions: FilterActions = { archive: true };
    const result = computeFilterActions(actions);
    expect(result.removeLabelIds).toContain("INBOX");
  });

  it("trashes (adds TRASH, removes INBOX)", () => {
    const actions: FilterActions = { trash: true };
    const result = computeFilterActions(actions);
    expect(result.addLabelIds).toContain("TRASH");
    expect(result.removeLabelIds).toContain("INBOX");
  });

  it("stars (adds STARRED)", () => {
    const actions: FilterActions = { star: true };
    const result = computeFilterActions(actions);
    expect(result.addLabelIds).toContain("STARRED");
    expect(result.star).toBe(true);
  });

  it("marks as read", () => {
    const actions: FilterActions = { markRead: true };
    const result = computeFilterActions(actions);
    expect(result.markRead).toBe(true);
  });

  it("combines multiple actions", () => {
    const actions: FilterActions = {
      applyLabel: "Label_1",
      archive: true,
      star: true,
      markRead: true,
    };
    const result = computeFilterActions(actions);
    expect(result.addLabelIds).toContain("Label_1");
    expect(result.addLabelIds).toContain("STARRED");
    expect(result.removeLabelIds).toContain("INBOX");
    expect(result.markRead).toBe(true);
    expect(result.star).toBe(true);
  });
});

describe("evaluateScoredConditions", () => {
  it("computes weighted score with weight 2.0 on matching condition", () => {
    const msg = createMockParsedMessage({ fromAddress: "alice@example.com" });
    const conditions = [
      { field: "from", operator: "contains", value: "alice", weight: 2.0 } as any,
    ];
    const result = evaluateScoredConditions(conditions, msg, "AND");
    expect(result.matched).toBe(true);
    expect(result.score).toBe(2.0);
  });

  it("computes partial score with weight 0.5 on non-matching condition", () => {
    const msg = createMockParsedMessage({ fromAddress: "alice@example.com" });
    const conditions = [
      { field: "from", operator: "contains", value: "bob", weight: 0.5 } as any,
    ];
    const result = evaluateScoredConditions(conditions, msg, "AND");
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
  });

  it("computes score with weight 2.0 on one condition and 0.5 on another (AND - both match)", () => {
    const msg = createMockParsedMessage({
      fromAddress: "alice@example.com",
      subject: "Project Update",
    });
    const conditions = [
      { field: "from", operator: "contains", value: "alice", weight: 2.0 } as any,
      { field: "subject", operator: "contains", value: "Project", weight: 0.5 } as any,
    ];
    const result = evaluateScoredConditions(conditions, msg, "AND");
    expect(result.matched).toBe(true);
    expect(result.score).toBe(2.5);
  });

  it("computes score with mixed match/no-match conditions (AND - one fails)", () => {
    const msg = createMockParsedMessage({
      fromAddress: "alice@example.com",
      subject: "Project Update",
    });
    const conditions = [
      { field: "from", operator: "contains", value: "alice", weight: 2.0 } as any,
      { field: "subject", operator: "contains", value: "Invoice", weight: 0.5 } as any,
    ];
    const result = evaluateScoredConditions(conditions, msg, "AND");
    expect(result.matched).toBe(false);
    expect(result.score).toBe(2.0);
  });

  it("computes score with OR logic - some match", () => {
    const msg = createMockParsedMessage({
      fromAddress: "alice@example.com",
      subject: "Project Update",
    });
    const conditions = [
      { field: "from", operator: "contains", value: "alice", weight: 2.0 } as any,
      { field: "subject", operator: "contains", value: "Invoice", weight: 0.5 } as any,
    ];
    const result = evaluateScoredConditions(conditions, msg, "OR");
    expect(result.matched).toBe(true);
    expect(result.score).toBe(2.0);
  });
});

describe("evaluateChainedRules", () => {
  async function mockConditions(map: Record<string, any[]>) {
    const { getFilterConditionsForRule } = await import("../db/filters");
    vi.mocked(getFilterConditionsForRule).mockImplementation(async (id: string) => {
      return map[id] ?? [];
    });
  }

  it("stops evaluation on match when chaining is stop (default)", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
      "rule-2": [{ id: "c2", filterId: "rule-2", field: "from", operator: "contains", value: "bob" }],
    });

    const msg = createMockParsedMessage({ fromAddress: "alice@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "stop" },
      { id: "rule-2", chaining_action: "stop" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("rule-1");
    expect(results[0]!.matched).toBe(true);
  });

  it("stops evaluation on no-match when chaining is stop", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
    });

    const msg = createMockParsedMessage({ fromName: "Bob Jones", fromAddress: "bob@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "stop" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe("rule-1");
    expect(results[0]!.matched).toBe(false);
  });

  it("continues to next rule on match when chaining is continue", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
      "rule-2": [{ id: "c2", filterId: "rule-2", field: "from", operator: "contains", value: "alice" }],
    });

    const msg = createMockParsedMessage({ fromAddress: "alice@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "continue" },
      { id: "rule-2", chaining_action: "stop" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(2);
    expect(results[0]!.ruleId).toBe("rule-1");
    expect(results[0]!.matched).toBe(true);
    expect(results[1]!.ruleId).toBe("rule-2");
  });

  it("continue_on_match stops on no-match", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
    });

    const msg = createMockParsedMessage({ fromName: "Bob Jones", fromAddress: "bob@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "continue_on_match" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(1);
    expect(results[0]!.matched).toBe(false);
  });

  it("continue_on_no_match stops on match", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
    });

    const msg = createMockParsedMessage({ fromAddress: "alice@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "continue_on_no_match" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(1);
    expect(results[0]!.matched).toBe(true);
  });

  it("continue_on_match continues to next when current matches", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
      "rule-2": [{ id: "c2", filterId: "rule-2", field: "from", operator: "contains", value: "alice" }],
    });

    const msg = createMockParsedMessage({ fromAddress: "alice@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "continue_on_match" },
      { id: "rule-2", chaining_action: "stop" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(2);
    expect(results[0]!.matched).toBe(true);
    expect(results[1]!.matched).toBe(true);
  });

  it("continue_on_no_match continues to next when current does not match", async () => {
    await mockConditions({
      "rule-1": [{ id: "c1", filterId: "rule-1", field: "from", operator: "contains", value: "alice" }],
      "rule-2": [{ id: "c2", filterId: "rule-2", field: "from", operator: "contains", value: "bob" }],
    });

    const msg = createMockParsedMessage({ fromName: "Bob Jones", fromAddress: "bob@example.com" });
    const rules = [
      { id: "rule-1", chaining_action: "continue_on_no_match" },
      { id: "rule-2", chaining_action: "stop" },
    ];

    const results = await evaluateChainedRules(rules as any, msg);
    expect(results).toHaveLength(2);
    expect(results[0]!.matched).toBe(false);
    expect(results[1]!.matched).toBe(true);
  });
});
