import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

import {
  imapTestConnection,
  imapListFolders,
  imapFetchMessages,
  imapFetchNewUids,
  imapFetchMessageBody,
  imapSetFlags,
  imapMoveMessages,
  imapDeleteMessages,
  imapGetFolderStatus,
  imapFetchAttachment,
  smtpSendEmail,
  smtpTestConnection,
  type ImapConfig,
  type SmtpConfig,
} from './tauriCommands';

const testImapConfig: ImapConfig = {
  host: 'imap.example.com',
  port: 993,
  security: 'tls',
  username: 'user@example.com',
  password: 'password123',
  auth_method: 'password',
};

const testSmtpConfig: SmtpConfig = {
  host: 'smtp.example.com',
  port: 465,
  security: 'tls',
  username: 'user@example.com',
  password: 'password123',
  auth_method: 'password',
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('IMAP Tauri commands', () => {
  it('imapTestConnection invokes with correct command and params', async () => {
    mockInvoke.mockResolvedValue('Connected successfully. Found 5 folder(s).');

    const result = await imapTestConnection(testImapConfig);

    expect(mockInvoke).toHaveBeenCalledWith('imap_test_connection', {
      config: testImapConfig,
    });
    expect(result).toBe('Connected successfully. Found 5 folder(s).');
  });

  it('imapListFolders invokes with correct command and params', async () => {
    const folders = [
      {
        path: 'INBOX',
        name: 'INBOX',
        delimiter: '/',
        special_use: null,
        exists: 42,
        unseen: 3,
      },
    ];
    mockInvoke.mockResolvedValue(folders);

    const result = await imapListFolders(testImapConfig);

    expect(mockInvoke).toHaveBeenCalledWith('imap_list_folders', {
      config: testImapConfig,
    });
    expect(result).toEqual(folders);
  });

  it('imapFetchMessages invokes with correct command and params', async () => {
    const fetchResult = {
      messages: [],
      folder_status: {
        uidvalidity: 1,
        uidnext: 100,
        exists: 50,
        unseen: 5,
        highest_modseq: null,
      },
    };
    mockInvoke.mockResolvedValue(fetchResult);

    const result = await imapFetchMessages(testImapConfig, 'INBOX', [1, 2, 3]);

    expect(mockInvoke).toHaveBeenCalledWith('imap_fetch_messages', {
      config: testImapConfig,
      folder: 'INBOX',
      uids: [1, 2, 3],
    });
    expect(result).toEqual(fetchResult);
  });

  it('imapFetchNewUids invokes with correct command and params', async () => {
    mockInvoke.mockResolvedValue([101, 102, 103]);

    const result = await imapFetchNewUids(testImapConfig, 'INBOX', 100);

    expect(mockInvoke).toHaveBeenCalledWith('imap_fetch_new_uids', {
      config: testImapConfig,
      folder: 'INBOX',
      sinceUid: 100,
    });
    expect(result).toEqual([101, 102, 103]);
  });

  it('imapFetchMessageBody invokes with correct command and params', async () => {
    const message = {
      uid: 42,
      folder: 'INBOX',
      message_id: '<msg@example.com>',
      in_reply_to: null,
      references: null,
      from_address: 'sender@example.com',
      from_name: 'Sender',
      to_addresses: 'user@example.com',
      cc_addresses: null,
      bcc_addresses: null,
      reply_to: null,
      subject: 'Test Subject',
      date: 1700000000,
      is_read: false,
      is_starred: false,
      is_draft: false,
      body_html: '<p>Hello</p>',
      body_text: 'Hello',
      snippet: 'Hello',
      raw_size: 1024,
      list_unsubscribe: null,
      list_unsubscribe_post: null,
      auth_results: null,
      attachments: [],
    };
    mockInvoke.mockResolvedValue(message);

    const result = await imapFetchMessageBody(testImapConfig, 'INBOX', 42);

    expect(mockInvoke).toHaveBeenCalledWith('imap_fetch_message_body', {
      config: testImapConfig,
      folder: 'INBOX',
      uid: 42,
    });
    expect(result).toEqual(message);
  });

  it('imapSetFlags invokes with correct command and params', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await imapSetFlags(testImapConfig, 'INBOX', [1, 2], ['Seen'], true);

    expect(mockInvoke).toHaveBeenCalledWith('imap_set_flags', {
      config: testImapConfig,
      folder: 'INBOX',
      uids: [1, 2],
      flags: ['Seen'],
      add: true,
    });
  });

  it('imapMoveMessages invokes with correct command and params', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await imapMoveMessages(testImapConfig, 'INBOX', [1, 2], 'Trash');

    expect(mockInvoke).toHaveBeenCalledWith('imap_move_messages', {
      config: testImapConfig,
      folder: 'INBOX',
      uids: [1, 2],
      destination: 'Trash',
    });
  });

  it('imapDeleteMessages invokes with correct command and params', async () => {
    mockInvoke.mockResolvedValue(undefined);

    await imapDeleteMessages(testImapConfig, 'INBOX', [1, 2]);

    expect(mockInvoke).toHaveBeenCalledWith('imap_delete_messages', {
      config: testImapConfig,
      folder: 'INBOX',
      uids: [1, 2],
    });
  });

  it('imapGetFolderStatus invokes with correct command and params', async () => {
    const status = {
      uidvalidity: 1,
      uidnext: 100,
      exists: 50,
      unseen: 5,
      highest_modseq: 12345,
    };
    mockInvoke.mockResolvedValue(status);

    const result = await imapGetFolderStatus(testImapConfig, 'INBOX');

    expect(mockInvoke).toHaveBeenCalledWith('imap_get_folder_status', {
      config: testImapConfig,
      folder: 'INBOX',
    });
    expect(result).toEqual(status);
  });

  it('imapFetchAttachment invokes with correct command and params', async () => {
    mockInvoke.mockResolvedValue('base64encodeddata==');

    const result = await imapFetchAttachment(testImapConfig, 'INBOX', 42, '1.2');

    expect(mockInvoke).toHaveBeenCalledWith('imap_fetch_attachment', {
      config: testImapConfig,
      folder: 'INBOX',
      uid: 42,
      partId: '1.2',
    });
    expect(result).toBe('base64encodeddata==');
  });
});

describe('SMTP Tauri commands', () => {
  it('smtpSendEmail invokes with correct command and params', async () => {
    const sendResult = { success: true, message: 'Email sent successfully' };
    mockInvoke.mockResolvedValue(sendResult);

    const result = await smtpSendEmail(testSmtpConfig, 'base64urlEncodedEmail');

    expect(mockInvoke).toHaveBeenCalledWith('smtp_send_email', {
      config: testSmtpConfig,
      rawEmail: 'base64urlEncodedEmail',
    });
    expect(result).toEqual(sendResult);
  });

  it('smtpTestConnection invokes with correct command and params', async () => {
    const testResult = { success: true, message: 'Connection successful' };
    mockInvoke.mockResolvedValue(testResult);

    const result = await smtpTestConnection(testSmtpConfig);

    expect(mockInvoke).toHaveBeenCalledWith('smtp_test_connection', {
      config: testSmtpConfig,
    });
    expect(result).toEqual(testResult);
  });

  it('smtpSendEmail propagates errors', async () => {
    mockInvoke.mockRejectedValue('SMTP send error: Connection refused');

    await expect(smtpSendEmail(testSmtpConfig, 'data')).rejects.toBe(
      'SMTP send error: Connection refused'
    );
  });

  it('imapTestConnection propagates errors', async () => {
    mockInvoke.mockRejectedValue('Login failed: Invalid credentials');

    await expect(imapTestConnection(testImapConfig)).rejects.toBe(
      'Login failed: Invalid credentials'
    );
  });
});
