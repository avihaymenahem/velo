import { describe, it, expect } from "vitest";
import { parseGmailMessage } from "./messageParser";
import { createMockGmailMessage } from "@/test/mocks";

describe("parseGmailMessage", () => {
  it("should parse basic message metadata", () => {
    const parsed = parseGmailMessage(createMockGmailMessage());

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
      createMockGmailMessage({ labelIds: ["INBOX", "UNREAD"] }),
    );
    expect(unread.isRead).toBe(false);

    const read = parseGmailMessage(createMockGmailMessage({ labelIds: ["INBOX"] }));
    expect(read.isRead).toBe(true);
  });

  it("should detect starred status from STARRED label", () => {
    const starred = parseGmailMessage(
      createMockGmailMessage({ labelIds: ["INBOX", "STARRED"] }),
    );
    expect(starred.isStarred).toBe(true);

    const notStarred = parseGmailMessage(
      createMockGmailMessage({ labelIds: ["INBOX"] }),
    );
    expect(notStarred.isStarred).toBe(false);
  });

  it("should detect attachments", () => {
    const withAttachment = createMockGmailMessage();
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
    const msg = createMockGmailMessage();
    msg.payload.headers = [
      { name: "From", value: "noreply@example.com" },
      { name: "To", value: "me@example.com" },
      { name: "Subject", value: "No Name" },
    ];

    const parsed = parseGmailMessage(msg);
    expect(parsed.fromAddress).toBe("noreply@example.com");
    expect(parsed.fromName).toBeNull();
  });

  it("should mark attachment with CID but with filename as not inline", () => {
    const msg = createMockGmailMessage();
    msg.payload.parts!.push({
      partId: "2",
      mimeType: "application/pdf",
      filename: "report.pdf",
      headers: [
        { name: "Content-ID", value: "<part1.abc@example.com>" },
        { name: "Content-Disposition", value: "attachment; filename=\"report.pdf\"" },
      ],
      body: { attachmentId: "att-1", size: 5000 },
    });

    const parsed = parseGmailMessage(msg);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]!.isInline).toBe(false);
    expect(parsed.attachments[0]!.contentId).toBe("part1.abc@example.com");
  });

  it("should mark CID image without filename as inline", () => {
    const msg = createMockGmailMessage();
    msg.payload.parts!.push({
      partId: "2",
      mimeType: "image/png",
      filename: "",
      headers: [
        { name: "Content-ID", value: "<img001@example.com>" },
        { name: "Content-Disposition", value: "inline" },
      ],
      body: { attachmentId: "att-1", size: 2000 },
    });

    const parsed = parseGmailMessage(msg);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]!.isInline).toBe(true);
  });

  it("should mark named file with inline disposition as not inline", () => {
    const msg = createMockGmailMessage();
    msg.payload.parts!.push({
      partId: "2",
      mimeType: "image/jpeg",
      filename: "photo.jpg",
      headers: [
        { name: "Content-Disposition", value: "inline; filename=\"photo.jpg\"" },
      ],
      body: { attachmentId: "att-1", size: 3000 },
    });

    const parsed = parseGmailMessage(msg);
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0]!.isInline).toBe(false);
  });

  it("should preserve label IDs", () => {
    const parsed = parseGmailMessage(
      createMockGmailMessage({
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
