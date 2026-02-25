import { describe, it, expect } from "vitest";
import { parseSearchQuery, hasSearchOperators } from "./searchParser";

describe("parseSearchQuery", () => {
  it("parses plain text with no operators", () => {
    const result = parseSearchQuery("hello world");
    expect(result.freeText).toBe("hello world");
    expect(result.from).toBeUndefined();
  });

  it("parses from: operator", () => {
    const result = parseSearchQuery("from:john@example.com");
    expect(result.from).toBe("john@example.com");
    expect(result.freeText).toBe("");
  });

  it("parses to: operator", () => {
    const result = parseSearchQuery("to:jane@example.com");
    expect(result.to).toBe("jane@example.com");
  });

  it("parses subject: operator", () => {
    const result = parseSearchQuery("subject:meeting");
    expect(result.subject).toBe("meeting");
  });

  it("parses has:attachment", () => {
    const result = parseSearchQuery("has:attachment");
    expect(result.hasAttachment).toBe(true);
  });

  it("parses is:unread", () => {
    const result = parseSearchQuery("is:unread");
    expect(result.isUnread).toBe(true);
  });

  it("parses is:read", () => {
    const result = parseSearchQuery("is:read");
    expect(result.isRead).toBe(true);
  });

  it("parses is:starred", () => {
    const result = parseSearchQuery("is:starred");
    expect(result.isStarred).toBe(true);
  });

  it("parses before: date", () => {
    const result = parseSearchQuery("before:2024/01/15");
    expect(result.before).toBeDefined();
    const date = new Date(2024, 0, 15);
    expect(result.before).toBe(Math.floor(date.getTime() / 1000));
  });

  it("parses after: date with dashes", () => {
    const result = parseSearchQuery("after:2024-06-01");
    expect(result.after).toBeDefined();
    const date = new Date(2024, 5, 1);
    expect(result.after).toBe(Math.floor(date.getTime() / 1000));
  });

  it("parses label: operator", () => {
    const result = parseSearchQuery("label:work");
    expect(result.label).toBe("work");
  });

  it("parses quoted values", () => {
    const result = parseSearchQuery('from:"John Doe" subject:"Project Update"');
    expect(result.from).toBe("John Doe");
    expect(result.subject).toBe("Project Update");
  });

  it("combines operators with free text", () => {
    const result = parseSearchQuery("budget report from:john@example.com is:unread");
    expect(result.freeText).toBe("budget report");
    expect(result.from).toBe("john@example.com");
    expect(result.isUnread).toBe(true);
  });

  it("handles multiple operators together", () => {
    const result = parseSearchQuery("from:alice to:bob has:attachment is:starred");
    expect(result.from).toBe("alice");
    expect(result.to).toBe("bob");
    expect(result.hasAttachment).toBe(true);
    expect(result.isStarred).toBe(true);
    expect(result.freeText).toBe("");
  });

  it("allows space after colon in operators", () => {
    const result = parseSearchQuery("from: tom has: attachment");
    expect(result.from).toBe("tom");
    expect(result.hasAttachment).toBe(true);
    expect(result.freeText).toBe("");
  });

  it("handles empty query", () => {
    const result = parseSearchQuery("");
    expect(result.freeText).toBe("");
  });

  it("ignores invalid has: values", () => {
    const result = parseSearchQuery("has:nothing");
    expect(result.hasAttachment).toBeUndefined();
  });

  it("ignores invalid is: values", () => {
    const result = parseSearchQuery("is:banana");
    expect(result.isUnread).toBeUndefined();
    expect(result.isRead).toBeUndefined();
    expect(result.isStarred).toBeUndefined();
  });

  it("ignores invalid date formats", () => {
    const result = parseSearchQuery("before:notadate");
    expect(result.before).toBeUndefined();
  });
});

describe("hasSearchOperators", () => {
  it("returns true for queries with operators", () => {
    expect(hasSearchOperators("from:test")).toBe(true);
    expect(hasSearchOperators("is:unread hello")).toBe(true);
    expect(hasSearchOperators("has:attachment")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(hasSearchOperators("hello world")).toBe(false);
    expect(hasSearchOperators("just searching")).toBe(false);
  });
});
