import { describe, it, expect } from "vitest";
import { parseGmailMessage } from "./messageParser";
import type { GmailMessage } from "./client";

function makeMessage(overrides: Partial<GmailMessage> = {}): GmailMessage {
  return {
    id: "msg-1",
    threadId: "thread-1",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Hello this is a test",
    historyId: "12345",
    internalDate: "1700000000000",
    sizeEstimate: 1024,
    payload: {
      partId: "",
      mimeType: "multipart/alternative",
      filename: "",
      headers: [
        { name: "From", value: "John Doe <john@example.com>" },
        { name: "To", value: "me@example.com" },
        { name: "Subject", value: "Test Subject" },
        { name: "Cc", value: "" },
      ],
      body: { size: 0 },
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          filename: "",
          headers: [],
          body: { size: 11, data: "SGVsbG8gV29ybGQ" }, // "Hello World" in base64url
        },
        {
          partId: "1",
          mimeType: "text/html",
          filename: "",
          headers: [],
          body: {
            size: 28,
            data: "PGI-SGVsbG8gV29ybGQ8L2I-", // "<b>Hello World</b>" in base64url
          },
        },
      ],
    },
    ...overrides,
  };
}

describe("parseGmailMessage", () => {
  it("should parse basic message metadata", () => {
    const parsed = parseGmailMessage(makeMessage());

    expect(parsed.id).toBe("msg-1");
    expect(parsed.threadId).toBe("thread-1");
    expect(parsed.fromAddress).toBe("john@example.com");
    expect(parsed.fromName).toBe("John Doe");
    expect(parsed.subject).toBe("Test Subject");
    expect(parsed.snippet).toBe("Hello this is a test");
    expect(parsed.rawSize).toBe(1024);
  });

  it("should detect unread status from UNREAD label", () => {
    const unread = parseGmailMessage(
      makeMessage({ labelIds: ["INBOX", "UNREAD"] }),
    );
    expect(unread.isRead).toBe(false);

    const read = parseGmailMessage(makeMessage({ labelIds: ["INBOX"] }));
    expect(read.isRead).toBe(true);
  });

  it("should detect starred status from STARRED label", () => {
    const starred = parseGmailMessage(
      makeMessage({ labelIds: ["INBOX", "STARRED"] }),
    );
    expect(starred.isStarred).toBe(true);

    const notStarred = parseGmailMessage(
      makeMessage({ labelIds: ["INBOX"] }),
    );
    expect(notStarred.isStarred).toBe(false);
  });

  it("should detect attachments", () => {
    const withAttachment = makeMessage();
    withAttachment.payload.parts!.push({
      partId: "2",
      mimeType: "application/pdf",
      filename: "report.pdf",
      headers: [],
      body: { attachmentId: "att-1", size: 5000 },
    });

    const parsed = parseGmailMessage(withAttachment);
    expect(parsed.hasAttachments).toBe(true);
  });

  it("should handle plain email address without name", () => {
    const msg = makeMessage();
    msg.payload.headers = [
      { name: "From", value: "noreply@example.com" },
      { name: "To", value: "me@example.com" },
      { name: "Subject", value: "No Name" },
    ];

    const parsed = parseGmailMessage(msg);
    expect(parsed.fromAddress).toBe("noreply@example.com");
    expect(parsed.fromName).toBeNull();
  });

  it("should preserve label IDs", () => {
    const parsed = parseGmailMessage(
      makeMessage({
        labelIds: ["INBOX", "UNREAD", "IMPORTANT", "Label_123"],
      }),
    );

    expect(parsed.labelIds).toEqual([
      "INBOX",
      "UNREAD",
      "IMPORTANT",
      "Label_123",
    ]);
  });
});
