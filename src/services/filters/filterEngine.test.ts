import { describe, it, expect } from "vitest";
import { messageMatchesFilter, computeFilterActions } from "./filterEngine";
import type { FilterCriteria, FilterActions } from "../db/filters";
import { createMockParsedMessage } from "@/test/mocks";

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
