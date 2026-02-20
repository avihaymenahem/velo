import type { ParsedMessage } from "@/services/gmail/messageParser";
import type { GmailMessage } from "@/services/gmail/client";
import type { DbAccount } from "@/services/db/accounts";
import type {
  ImapMessage,
  ImapFolder,
  ImapConfig,
  ImapFolderStatus,
  ImapFetchResult,
} from "@/services/imap/tauriCommands";
import type { QuickStep } from "@/services/quickSteps/types";
import type { SendAsAlias } from "@/services/db/sendAsAliases";

export function createMockParsedMessage(
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage {
  return {
    id: "msg-1",
    threadId: "thread-1",
    fromAddress: "alice@example.com",
    fromName: "Alice Smith",
    toAddresses: "bob@example.com",
    ccAddresses: null,
    bccAddresses: null,
    replyTo: null,
    subject: "Project Update",
    snippet: "Here is the latest update...",
    date: Date.now(),
    isRead: false,
    isStarred: false,
    bodyHtml: "<p>Hello from the project</p>",
    bodyText: "Hello from the project",
    rawSize: 1024,
    internalDate: Date.now(),
    labelIds: ["INBOX", "UNREAD"],
    hasAttachments: false,
    attachments: [],
    listUnsubscribe: null,
    listUnsubscribePost: null,
    authResults: null,
    ...overrides,
  };
}

export function createMockGmailMessage(
  overrides: Partial<GmailMessage> = {},
): GmailMessage {
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
          body: { size: 11, data: "SGVsbG8gV29ybGQ" },
        },
        {
          partId: "1",
          mimeType: "text/html",
          filename: "",
          headers: [],
          body: {
            size: 28,
            data: "PGI-SGVsbG8gV29ybGQ8L2I-",
          },
        },
      ],
    },
    ...overrides,
  };
}

export function createMockGmailAccount(
  overrides: Partial<DbAccount> = {},
): DbAccount {
  return {
    id: "acc-gmail",
    email: "user@gmail.com",
    display_name: "Gmail User",
    avatar_url: null,
    access_token: "enc:access-token",
    refresh_token: "enc:refresh-token",
    token_expires_at: 9999999999,
    history_id: "12345",
    last_sync_at: 1700000000,
    is_active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    provider: "gmail_api",
    imap_host: null,
    imap_port: null,
    imap_security: null,
    smtp_host: null,
    smtp_port: null,
    smtp_security: null,
    auth_method: "oauth",
    imap_password: null,
    oauth_provider: null,
    oauth_client_id: null,
    oauth_client_secret: null,
    imap_username: null,
    caldav_url: null,
    caldav_username: null,
    caldav_password: null,
    caldav_principal_url: null,
    caldav_home_url: null,
    calendar_provider: null,
    ...overrides,
  };
}

export function createMockImapAccount(
  overrides: Partial<DbAccount> = {},
): DbAccount {
  return {
    id: "acc-imap",
    email: "user@example.com",
    display_name: "IMAP User",
    avatar_url: null,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    history_id: null,
    last_sync_at: null,
    is_active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    provider: "imap",
    imap_host: "imap.example.com",
    imap_port: 993,
    imap_security: "tls",
    smtp_host: "smtp.example.com",
    smtp_port: 465,
    smtp_security: "tls",
    auth_method: "password",
    imap_password: "enc:secret-password",
    oauth_provider: null,
    oauth_client_id: null,
    oauth_client_secret: null,
    imap_username: null,
    caldav_url: null,
    caldav_username: null,
    caldav_password: null,
    caldav_principal_url: null,
    caldav_home_url: null,
    calendar_provider: null,
    ...overrides,
  };
}

export function createMockDbAccount(
  overrides: Partial<DbAccount> = {},
): DbAccount {
  return {
    id: "acc-1",
    email: "user@example.com",
    display_name: "Test User",
    avatar_url: null,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    history_id: null,
    last_sync_at: null,
    is_active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    provider: "imap",
    imap_host: "imap.example.com",
    imap_port: 993,
    imap_security: "ssl",
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_security: "starttls",
    auth_method: "password",
    imap_password: "secret123",
    oauth_provider: null,
    oauth_client_id: null,
    oauth_client_secret: null,
    imap_username: null,
    caldav_url: null,
    caldav_username: null,
    caldav_password: null,
    caldav_principal_url: null,
    caldav_home_url: null,
    calendar_provider: null,
    ...overrides,
  };
}

export function createMockImapMessage(
  overrides: Partial<ImapMessage> = {},
): ImapMessage {
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

export function createMockImapFolder(
  overrides: Partial<ImapFolder> = {},
): ImapFolder {
  const path = overrides.path ?? "INBOX";
  return {
    path,
    raw_path: path,
    name: "INBOX",
    delimiter: "/",
    special_use: null,
    exists: 100,
    unseen: 10,
    ...overrides,
  };
}

export function createMockImapConfig(
  overrides: Partial<ImapConfig> = {},
): ImapConfig {
  return {
    host: "imap.example.com",
    port: 993,
    security: "tls",
    username: "user@example.com",
    password: "secret",
    auth_method: "password",
    ...overrides,
  };
}

export function createMockImapFolderStatus(
  overrides: Partial<ImapFolderStatus> = {},
): ImapFolderStatus {
  return {
    uidvalidity: 1,
    uidnext: 100,
    exists: 0,
    unseen: 0,
    highest_modseq: null,
    ...overrides,
  };
}

export function createMockImapFetchResult(
  messages: ImapMessage[] = [],
  statusOverrides: Partial<ImapFolderStatus> = {},
): ImapFetchResult {
  return {
    messages,
    folder_status: createMockImapFolderStatus({
      exists: messages.length,
      ...statusOverrides,
    }),
  };
}

export function createMockQuickStep(
  overrides: Partial<QuickStep> = {},
): QuickStep {
  return {
    id: "qs-1",
    accountId: "acct-1",
    name: "Test Quick Step",
    description: null,
    shortcut: null,
    actions: [],
    icon: null,
    isEnabled: true,
    continueOnError: false,
    sortOrder: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createMockSendAsAlias(
  overrides: Partial<SendAsAlias> = {},
): SendAsAlias {
  return {
    id: "alias-1",
    accountId: "acc-1",
    email: "primary@example.com",
    displayName: null,
    replyToAddress: null,
    signatureId: null,
    isPrimary: false,
    isDefault: false,
    treatAsAlias: true,
    verificationStatus: "accepted",
    ...overrides,
  };
}
