import { invoke } from "@tauri-apps/api/core";

export interface GmailMessage {
  id: string;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  reply_to: string | null;
  subject: string | null;
  snippet: string | null;
  date: number;
  is_read: boolean;
  is_starred: boolean;
  body_html: string | null;
  body_text: string | null;
  raw_size: number | null;
  internal_date: number | null;
  list_unsubscribe: string | null;
  list_unsubscribe_post: string | null;
  auth_results: string | null;
  message_id_header: string | null;
  references_header: string | null;
  in_reply_to_header: string | null;
}

export interface GmailAttachment {
  id: string;
  message_id: string;
  filename: string | null;
  mime_type: string | null;
  size: number | null;
  gmail_attachment_id: string | null;
  content_id: string | null;
  is_inline: boolean;
}

export interface GmailStoredHeader {
  thread_id: string;
  message_count: number;
}

/**
 * Write a complete Gmail thread (messages + attachments + labels) directly to SQLite
 * via rusqlite — no Tauri SQL plugin (WebKit IPC) involved for the store step.
 * Reduces per-thread IPC from 5–10 calls to 1; bodies never bounce through WebKit heap.
 */
export async function gmailStoreThread(params: {
  accountId: string;
  threadId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: number;
  messageCount: number;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  hasAttachments: boolean;
  labelIds: string[];
  messages: GmailMessage[];
  attachments: GmailAttachment[];
}): Promise<GmailStoredHeader> {
  return invoke<GmailStoredHeader>("gmail_store_thread", {
    accountId: params.accountId,
    threadId: params.threadId,
    subject: params.subject,
    snippet: params.snippet,
    lastMessageAt: params.lastMessageAt,
    messageCount: params.messageCount,
    isRead: params.isRead,
    isStarred: params.isStarred,
    isImportant: params.isImportant,
    hasAttachments: params.hasAttachments,
    labelIds: params.labelIds,
    messages: params.messages,
    attachments: params.attachments,
  });
}
