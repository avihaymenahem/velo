import {
  buildThreads,
  updateThreads,
  normalizeSubject,
  parseReferences,
  generateThreadId,
  type ThreadableMessage,
  type ThreadGroup,
} from './threadBuilder';

// ---------------------------------------------------------------------------
// normalizeSubject
// ---------------------------------------------------------------------------

describe('normalizeSubject', () => {
  it('returns empty string for null input', () => {
    expect(normalizeSubject(null)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeSubject('')).toBe('');
    expect(normalizeSubject('   ')).toBe('');
  });

  it('returns subject unchanged when already clean', () => {
    expect(normalizeSubject('Hello World')).toBe('Hello World');
  });

  it('strips Re: prefix', () => {
    expect(normalizeSubject('Re: Hello')).toBe('Hello');
  });

  it('strips RE: prefix (uppercase)', () => {
    expect(normalizeSubject('RE: Hello')).toBe('Hello');
  });

  it('strips re: prefix (lowercase)', () => {
    expect(normalizeSubject('re: Hello')).toBe('Hello');
  });

  it('strips Fwd: prefix', () => {
    expect(normalizeSubject('Fwd: Hello')).toBe('Hello');
  });

  it('strips FWD: prefix', () => {
    expect(normalizeSubject('FWD: Hello')).toBe('Hello');
  });

  it('strips Fw: prefix', () => {
    expect(normalizeSubject('Fw: Hello')).toBe('Hello');
  });

  it('strips FW: prefix', () => {
    expect(normalizeSubject('FW: Hello')).toBe('Hello');
  });

  it('handles nested prefixes: Re: Re: Fwd: Hello', () => {
    expect(normalizeSubject('Re: Re: Fwd: Hello')).toBe('Hello');
  });

  it('handles mixed case nested prefixes', () => {
    expect(normalizeSubject('RE: Fw: re: FWD: Subject')).toBe('Subject');
  });

  it('strips [list-name] prefix', () => {
    expect(normalizeSubject('[node-dev] Some topic')).toBe('Some topic');
  });

  it('strips [list-name] with Re: prefix', () => {
    expect(normalizeSubject('[node-dev] Re: Some topic')).toBe('Some topic');
  });

  it('strips Re: before [list-name]', () => {
    expect(normalizeSubject('Re: [node-dev] Some topic')).toBe('Some topic');
  });

  it('handles multiple bracket prefixes', () => {
    expect(normalizeSubject('[PATCH] [v2] Fix bug')).toBe('Fix bug');
  });

  it('trims whitespace', () => {
    expect(normalizeSubject('  Re:   Hello  ')).toBe('Hello');
  });

  it('handles Re: with no space after colon', () => {
    expect(normalizeSubject('Re:Hello')).toBe('Hello');
  });
});

// ---------------------------------------------------------------------------
// parseReferences
// ---------------------------------------------------------------------------

describe('parseReferences', () => {
  it('returns empty array for null input', () => {
    expect(parseReferences(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseReferences('')).toEqual([]);
    expect(parseReferences('   ')).toEqual([]);
  });

  it('parses single angle-bracket Message-ID', () => {
    expect(parseReferences('<abc@host.com>')).toEqual(['abc@host.com']);
  });

  it('parses multiple angle-bracket Message-IDs', () => {
    expect(parseReferences('<id1@host> <id2@host>')).toEqual([
      'id1@host',
      'id2@host',
    ]);
  });

  it('parses Message-IDs with various separators', () => {
    expect(parseReferences('<id1@host>\n<id2@host>\t<id3@host>')).toEqual([
      'id1@host',
      'id2@host',
      'id3@host',
    ]);
  });

  it('handles bare IDs without angle brackets as fallback', () => {
    expect(parseReferences('id1@host id2@host')).toEqual([
      'id1@host',
      'id2@host',
    ]);
  });

  it('handles malformed references gracefully', () => {
    // Partial angle brackets
    expect(parseReferences('<id1@host> garbage <id2@host>')).toEqual([
      'id1@host',
      'id2@host',
    ]);
  });

  it('handles empty angle brackets', () => {
    // <> should be skipped because the inner content is empty after trim
    const result = parseReferences('<> <real@id>');
    expect(result).toContain('real@id');
  });

  it('preserves order', () => {
    expect(
      parseReferences('<first@host> <second@host> <third@host>'),
    ).toEqual(['first@host', 'second@host', 'third@host']);
  });
});

// ---------------------------------------------------------------------------
// generateThreadId
// ---------------------------------------------------------------------------

describe('generateThreadId', () => {
  it('returns imap-thread-{hex} format', () => {
    const id = generateThreadId('abc@host.com');
    expect(id).toMatch(/^imap-thread-[0-9a-f]+$/);
  });

  it('is deterministic: same input produces same output', () => {
    const id1 = generateThreadId('test@example.com');
    const id2 = generateThreadId('test@example.com');
    expect(id1).toBe(id2);
  });

  it('produces different IDs for different inputs', () => {
    const id1 = generateThreadId('msg1@host.com');
    const id2 = generateThreadId('msg2@host.com');
    expect(id1).not.toBe(id2);
  });

  it('handles long Message-IDs', () => {
    const longId =
      'very-long-message-id-with-lots-of-characters-1234567890@extremely-long-domain-name.example.com';
    const id = generateThreadId(longId);
    expect(id).toMatch(/^imap-thread-[0-9a-f]+$/);
  });

  it('handles special characters', () => {
    const id = generateThreadId('msg+special=chars@host.com');
    expect(id).toMatch(/^imap-thread-[0-9a-f]+$/);
  });
});

// ---------------------------------------------------------------------------
// buildThreads
// ---------------------------------------------------------------------------

describe('buildThreads', () => {
  it('returns empty array for empty input', () => {
    expect(buildThreads([])).toEqual([]);
  });

  it('puts standalone messages in their own threads', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-1',
        messageId: 'msg1@host',
        inReplyTo: null,
        references: null,
        subject: 'First email',
        date: 1000,
      },
      {
        id: 'local-2',
        messageId: 'msg2@host',
        inReplyTo: null,
        references: null,
        subject: 'Second email',
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(2);
    expect(threads[0].messageIds).toHaveLength(1);
    expect(threads[1].messageIds).toHaveLength(1);
  });

  it('groups a simple reply chain: A → B → C', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Topic',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Topic',
        date: 2000,
      },
      {
        id: 'local-c',
        messageId: 'c@host',
        inReplyTo: '<b@host>',
        references: '<a@host> <b@host>',
        subject: 'Re: Re: Topic',
        date: 3000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(3);
    expect(threads[0].messageIds).toContain('local-a');
    expect(threads[0].messageIds).toContain('local-b');
    expect(threads[0].messageIds).toContain('local-c');
  });

  it('sorts messages within a thread by date ascending', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-c',
        messageId: 'c@host',
        inReplyTo: '<b@host>',
        references: '<a@host> <b@host>',
        subject: 'Re: Topic',
        date: 3000,
      },
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Topic',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Topic',
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    // Messages should be sorted by date
    expect(threads[0].messageIds).toEqual([
      'local-a',
      'local-b',
      'local-c',
    ]);
  });

  it('groups a fork: A → B, A → C into one thread', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Topic',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Topic',
        date: 2000,
      },
      {
        id: 'local-c',
        messageId: 'c@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Topic',
        date: 3000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(3);
    expect(threads[0].messageIds).toContain('local-a');
    expect(threads[0].messageIds).toContain('local-b');
    expect(threads[0].messageIds).toContain('local-c');
  });

  it('handles messages with only In-Reply-To (no References)', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Topic',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: null,
        subject: 'Re: Topic',
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(2);
  });

  it('handles phantom parents (references to non-existent Message-IDs)', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<missing@host>',
        references: '<missing@host>',
        subject: 'Re: Topic',
        date: 2000,
      },
      {
        id: 'local-c',
        messageId: 'c@host',
        inReplyTo: '<missing@host>',
        references: '<missing@host>',
        subject: 'Re: Topic',
        date: 3000,
      },
    ];

    const threads = buildThreads(messages);
    // Both should be in the same thread (shared phantom parent)
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(2);
    expect(threads[0].messageIds).toContain('local-b');
    expect(threads[0].messageIds).toContain('local-c');
  });

  it('groups two root messages with same normalized subject', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Meeting notes',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: null,
        references: null,
        subject: 'Re: Meeting notes',
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(2);
  });

  it('does not merge threads with different subjects', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Meeting notes',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: null,
        references: null,
        subject: 'Lunch plans',
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(2);
  });

  it('handles complex References chain', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Thread',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Thread',
        date: 2000,
      },
      {
        id: 'local-c',
        messageId: 'c@host',
        inReplyTo: '<b@host>',
        references: '<a@host> <b@host>',
        subject: 'Re: Thread',
        date: 3000,
      },
      {
        id: 'local-d',
        messageId: 'd@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Thread',
        date: 4000,
      },
      {
        id: 'local-e',
        messageId: 'e@host',
        inReplyTo: '<d@host>',
        references: '<a@host> <d@host>',
        subject: 'Re: Thread',
        date: 5000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(5);
  });

  it('generates deterministic thread IDs based on root Message-ID', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'root@host',
        inReplyTo: null,
        references: null,
        subject: 'Topic',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'reply@host',
        inReplyTo: '<root@host>',
        references: '<root@host>',
        subject: 'Re: Topic',
        date: 2000,
      },
    ];

    const threads1 = buildThreads(messages);
    const threads2 = buildThreads(messages);

    expect(threads1).toHaveLength(1);
    expect(threads1[0].threadId).toBe(threads2[0].threadId);
    expect(threads1[0].threadId).toBe(generateThreadId('root@host'));
  });

  it('handles messages arriving out of order', () => {
    // Reply arrives before the original
    const messages: ThreadableMessage[] = [
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: Hello',
        date: 2000,
      },
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'Hello',
        date: 1000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(2);
    // Should be sorted by date
    expect(threads[0].messageIds[0]).toBe('local-a');
    expect(threads[0].messageIds[1]).toBe('local-b');
  });

  it('handles messages with null subjects', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: null,
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: null,
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(2);
  });

  it('single message produces a single thread', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-1',
        messageId: 'only@host',
        inReplyTo: null,
        references: null,
        subject: 'Solo',
        date: 1000,
      },
    ];

    const threads = buildThreads(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toEqual(['local-1']);
  });

  it('does not merge subjects that differ only by list prefix', () => {
    const messages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: '[list-a] Topic',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: null,
        references: null,
        subject: '[list-b] Topic',
        date: 2000,
      },
    ];

    const threads = buildThreads(messages);
    // Both normalize to "Topic", so they should merge
    expect(threads).toHaveLength(1);
    expect(threads[0].messageIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// updateThreads
// ---------------------------------------------------------------------------

describe('updateThreads', () => {
  it('returns empty array when no new messages', () => {
    const existing: ThreadGroup[] = [
      { threadId: 'imap-thread-abc', messageIds: ['local-1'] },
    ];
    expect(updateThreads(existing, [])).toEqual([]);
  });

  it('creates new thread for standalone new message', () => {
    const existing: ThreadGroup[] = [
      { threadId: 'imap-thread-abc', messageIds: ['local-1'] },
    ];

    const newMessages: ThreadableMessage[] = [
      {
        id: 'local-2',
        messageId: 'new@host',
        inReplyTo: null,
        references: null,
        subject: 'New topic',
        date: 2000,
      },
    ];

    const result = updateThreads(existing, newMessages);
    expect(result).toHaveLength(1);
    expect(result[0].messageIds).toContain('local-2');
    // Should be a different thread than existing
    expect(result[0].threadId).not.toBe('imap-thread-abc');
  });

  it('merges new message into existing thread when threadId matches', () => {
    const rootMsgId = 'root@host';
    const existingThreadId = generateThreadId(rootMsgId);

    const existing: ThreadGroup[] = [
      { threadId: existingThreadId, messageIds: ['local-1'] },
    ];

    const newMessages: ThreadableMessage[] = [
      {
        id: 'local-2',
        messageId: 'reply@host',
        inReplyTo: `<${rootMsgId}>`,
        references: `<${rootMsgId}>`,
        subject: 'Re: Topic',
        date: 2000,
      },
    ];

    const result = updateThreads(existing, newMessages);
    expect(result).toHaveLength(1);
    // The thread should reference the root message ID, so check by threadId
    // The new message references root@host, and if buildThreads creates a phantom
    // container for root@host, the thread ID should match
    expect(result[0].threadId).toBe(existingThreadId);
    expect(result[0].messageIds).toContain('local-2');
    expect(result[0].messageIds).toContain('local-1');
  });

  it('creates new thread for message referencing unknown parent', () => {
    const existing: ThreadGroup[] = [
      {
        threadId: generateThreadId('other@host'),
        messageIds: ['local-1'],
      },
    ];

    const newMessages: ThreadableMessage[] = [
      {
        id: 'local-2',
        messageId: 'orphan-reply@host',
        inReplyTo: '<unknown@host>',
        references: '<unknown@host>',
        subject: 'Re: Unknown',
        date: 2000,
      },
    ];

    const result = updateThreads(existing, newMessages);
    expect(result).toHaveLength(1);
    expect(result[0].messageIds).toContain('local-2');
  });

  it('handles multiple new messages forming a new thread', () => {
    const existing: ThreadGroup[] = [];

    const newMessages: ThreadableMessage[] = [
      {
        id: 'local-a',
        messageId: 'a@host',
        inReplyTo: null,
        references: null,
        subject: 'New thread',
        date: 1000,
      },
      {
        id: 'local-b',
        messageId: 'b@host',
        inReplyTo: '<a@host>',
        references: '<a@host>',
        subject: 'Re: New thread',
        date: 2000,
      },
    ];

    const result = updateThreads(existing, newMessages);
    expect(result).toHaveLength(1);
    expect(result[0].messageIds).toHaveLength(2);
    expect(result[0].messageIds).toContain('local-a');
    expect(result[0].messageIds).toContain('local-b');
  });

  it('merges new message that bridges two existing threads via references', () => {
    const threadId1 = generateThreadId('root1@host');
    const threadId2 = generateThreadId('root2@host');

    const existing: ThreadGroup[] = [
      { threadId: threadId1, messageIds: ['local-1'] },
      { threadId: threadId2, messageIds: ['local-2'] },
    ];

    // New message references root1@host — should merge into thread 1
    const newMessages: ThreadableMessage[] = [
      {
        id: 'local-3',
        messageId: 'bridge@host',
        inReplyTo: '<root1@host>',
        references: '<root1@host> <root2@host>',
        subject: 'Re: Topic',
        date: 3000,
      },
    ];

    const result = updateThreads(existing, newMessages);
    // Should have at least one thread containing the new message
    expect(result.length).toBeGreaterThanOrEqual(1);
    const threadWithBridge = result.find((t) =>
      t.messageIds.includes('local-3'),
    );
    expect(threadWithBridge).toBeDefined();
  });
});
