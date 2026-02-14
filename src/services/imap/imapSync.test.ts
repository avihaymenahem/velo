import { describe, it, expect } from "vitest";
import { imapMessageToParsedMessage } from "./imapSync";
import type { ImapMessage } from "./tauriCommands";

function makeImapMessage(overrides: Partial<ImapMessage> = {}): ImapMessage {
  return {
    uid: 42,
    folder: "INBOX",
    message_id: "<test-123@example.com>",
    in_reply_to: null,
    references: null,
    from_address: "sender@example.com",
    from_name: "Sender Name",
    to_addresses: "recipient@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    subject: "Test Subject",
    date: 1700000000,
    is_read: false,
    is_starred: false,
    is_draft: false,
    body_html: "<p>Hello</p>",
    body_text: "Hello",
    snippet: "Hello",
    raw_size: 1024,
    list_unsubscribe: null,
    list_unsubscribe_post: null,
    auth_results: null,
    attachments: [],
    ...overrides,
  };
}

describe("imapMessageToParsedMessage", () => {
  it("converts basic IMAP message to ParsedMessage format", () => {
    const msg = makeImapMessage();
    const { parsed, threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(parsed.id).toBe("imap-acc-1-INBOX-42");
    expect(parsed.fromAddress).toBe("sender@example.com");
    expect(parsed.fromName).toBe("Sender Name");
    expect(parsed.toAddresses).toBe("recipient@example.com");
    expect(parsed.subject).toBe("Test Subject");
    expect(parsed.date).toBe(1700000000);
    expect(parsed.isRead).toBe(false);
    expect(parsed.isStarred).toBe(false);
    expect(parsed.bodyHtml).toBe("<p>Hello</p>");
    expect(parsed.bodyText).toBe("Hello");
    expect(parsed.snippet).toBe("Hello");
    expect(parsed.rawSize).toBe(1024);
    expect(parsed.hasAttachments).toBe(false);
    expect(parsed.attachments).toEqual([]);
  });

  it("generates stable message ID from account, folder, and uid", () => {
    const msg = makeImapMessage({ uid: 99, folder: "Sent" });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-2", "SENT");
    expect(parsed.id).toBe("imap-acc-2-Sent-99");
  });

  it("includes UNREAD label for unread messages", () => {
    const msg = makeImapMessage({ is_read: false });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.labelIds).toContain("UNREAD");
    expect(parsed.labelIds).toContain("INBOX");
  });

  it("does not include UNREAD label for read messages", () => {
    const msg = makeImapMessage({ is_read: true });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.labelIds).not.toContain("UNREAD");
    expect(parsed.labelIds).toContain("INBOX");
  });

  it("includes STARRED label for flagged messages", () => {
    const msg = makeImapMessage({ is_starred: true, is_read: true });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.labelIds).toContain("STARRED");
  });

  it("creates threadable message with correct fields", () => {
    const msg = makeImapMessage({
      message_id: "<msg-abc@host.com>",
      in_reply_to: "<msg-parent@host.com>",
      references: "<msg-root@host.com> <msg-parent@host.com>",
    });
    const { threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(threadable.id).toBe("imap-acc-1-INBOX-42");
    expect(threadable.messageId).toBe("<msg-abc@host.com>");
    expect(threadable.inReplyTo).toBe("<msg-parent@host.com>");
    expect(threadable.references).toBe("<msg-root@host.com> <msg-parent@host.com>");
    expect(threadable.subject).toBe("Test Subject");
    expect(threadable.date).toBe(1700000000);
  });

  it("generates synthetic message ID when none present", () => {
    const msg = makeImapMessage({ message_id: null });
    const { threadable } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(threadable.messageId).toBe("synthetic-acc-1-INBOX-42@velo.local");
  });

  it("converts attachments correctly", () => {
    const msg = makeImapMessage({
      attachments: [
        {
          part_id: "2",
          filename: "report.pdf",
          mime_type: "application/pdf",
          size: 50000,
          content_id: null,
          is_inline: false,
        },
        {
          part_id: "3",
          filename: "logo.png",
          mime_type: "image/png",
          size: 1024,
          content_id: "logo-cid",
          is_inline: true,
        },
      ],
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");

    expect(parsed.hasAttachments).toBe(true);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]).toEqual({
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 50000,
      gmailAttachmentId: "2",
      contentId: null,
      isInline: false,
    });
    expect(parsed.attachments[1]).toEqual({
      filename: "logo.png",
      mimeType: "image/png",
      size: 1024,
      gmailAttachmentId: "3",
      contentId: "logo-cid",
      isInline: true,
    });
  });

  it("generates snippet from body_text when snippet is null", () => {
    const msg = makeImapMessage({
      snippet: null,
      body_text: "This is a long email body that should be truncated to create a snippet for display purposes.",
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.snippet).toBe("This is a long email body that should be truncated to create a snippet for display purposes.");
  });

  it("handles null body fields gracefully", () => {
    const msg = makeImapMessage({
      body_html: null,
      body_text: null,
      snippet: null,
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.bodyHtml).toBeNull();
    expect(parsed.bodyText).toBeNull();
    expect(parsed.snippet).toBe("");
  });

  it("preserves list-unsubscribe headers", () => {
    const msg = makeImapMessage({
      list_unsubscribe: "<mailto:unsub@list.com>",
      list_unsubscribe_post: "List-Unsubscribe=One-Click",
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.listUnsubscribe).toBe("<mailto:unsub@list.com>");
    expect(parsed.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
  });

  it("preserves auth results", () => {
    const msg = makeImapMessage({
      auth_results: '{"spf":"pass","dkim":"pass"}',
    });
    const { parsed } = imapMessageToParsedMessage(msg, "acc-1", "INBOX");
    expect(parsed.authResults).toBe('{"spf":"pass","dkim":"pass"}');
  });
});
