/**
 * JWZ-inspired email threading algorithm.
 * Groups messages into conversation threads using Message-ID,
 * In-Reply-To, and References headers.
 *
 * Reference: https://www.jwz.org/doc/threading.html
 */

export interface ThreadableMessage {
  id: string; // local message ID (from DB)
  messageId: string; // RFC 2822 Message-ID header
  inReplyTo: string | null;
  references: string | null; // space-separated list of Message-IDs
  subject: string | null;
  date: number; // unix timestamp
}

export interface ThreadGroup {
  threadId: string; // generated thread ID for this group
  messageIds: string[]; // local message IDs belonging to this thread
}

/**
 * Internal container used during threading. Each container wraps a message
 * (or is a phantom placeholder for a referenced but unseen Message-ID)
 * and tracks parent-child relationships.
 */
interface Container {
  messageId: string;
  message: ThreadableMessage | null;
  parent: Container | null;
  children: Container[];
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Strip Re:/Fwd:/Fw: prefixes and normalize subject for comparison.
 * Also strips [list-prefix] tags.
 */
export function normalizeSubject(subject: string | null): string {
  if (!subject) return '';

  let s = subject.trim();
  let changed = true;

  while (changed) {
    changed = false;

    // Strip leading [list-prefix] tags like [node-dev]
    const bracketMatch = /^\[[^\]]*\]\s*/i.exec(s);
    if (bracketMatch) {
      s = s.slice(bracketMatch[0].length);
      changed = true;
    }

    // Strip leading Re:/Fwd:/Fw: (case-insensitive)
    const prefixMatch = /^(?:re|fwd|fw)\s*:\s*/i.exec(s);
    if (prefixMatch) {
      s = s.slice(prefixMatch[0].length);
      changed = true;
    }
  }

  return s.trim();
}

/**
 * Parse a References header into individual Message-IDs.
 * Handles angle-bracket-delimited IDs and bare IDs separated by whitespace.
 */
export function parseReferences(references: string | null): string[] {
  if (!references || !references.trim()) return [];

  const ids: string[] = [];
  // Match angle-bracket-delimited Message-IDs: <something@host>
  const angleBracketRegex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;

  match = angleBracketRegex.exec(references);
  while (match !== null) {
    const id = match[1]?.trim();
    if (id) {
      ids.push(id);
    }
    match = angleBracketRegex.exec(references);
  }

  // If no angle-bracket IDs found, try splitting on whitespace as fallback
  if (ids.length === 0) {
    const tokens = references.trim().split(/\s+/);
    for (const token of tokens) {
      const cleaned = token.replace(/^<|>$/g, '').trim();
      if (cleaned) {
        ids.push(cleaned);
      }
    }
  }

  return ids;
}

/**
 * Simple djb2 hash function. Returns a hex string.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16);
}

/**
 * Generate a deterministic thread ID from a root Message-ID.
 */
export function generateThreadId(rootMessageId: string): string {
  return `imap-thread-${djb2Hash(rootMessageId)}`;
}

// ---------------------------------------------------------------------------
// Container helpers
// ---------------------------------------------------------------------------

function createContainer(messageId: string): Container {
  return {
    messageId,
    message: null,
    parent: null,
    children: [],
  };
}

/**
 * Check whether `ancestor` is an ancestor of `container` (or the same container).
 * Used to prevent cycles when linking parent-child.
 */
function isAncestor(container: Container, ancestor: Container): boolean {
  let current: Container | null = container;
  while (current !== null) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Remove a child from its current parent.
 */
function unlinkFromParent(child: Container): void {
  if (child.parent) {
    child.parent.children = child.parent.children.filter((c) => c !== child);
    child.parent = null;
  }
}

/**
 * Set `parent` as the parent of `child`, avoiding cycles.
 */
function linkParentChild(parent: Container, child: Container): void {
  // Don't create a cycle: if child is already an ancestor of parent, skip
  if (isAncestor(parent, child)) return;
  // Don't re-link if already correct
  if (child.parent === parent) return;

  unlinkFromParent(child);
  child.parent = parent;
  parent.children.push(child);
}

// ---------------------------------------------------------------------------
// Main algorithm
// ---------------------------------------------------------------------------

/**
 * Group messages into threads using JWZ algorithm.
 * Returns thread groups with generated thread IDs.
 */
export function buildThreads(messages: ThreadableMessage[]): ThreadGroup[] {
  if (messages.length === 0) return [];

  // Step 1: Build the ID table — map Message-ID → Container
  const idTable = new Map<string, Container>();

  function getOrCreateContainer(messageId: string): Container {
    let container = idTable.get(messageId);
    if (!container) {
      container = createContainer(messageId);
      idTable.set(messageId, container);
    }
    return container;
  }

  // Step 2: For each message, create/find containers and link parent-child
  for (const msg of messages) {
    const container = getOrCreateContainer(msg.messageId);
    container.message = msg;

    // Build the reference chain: References + In-Reply-To
    const refIds = parseReferences(msg.references);
    if (msg.inReplyTo) {
      const inReplyToIds = parseReferences(msg.inReplyTo);
      for (const id of inReplyToIds) {
        if (!refIds.includes(id)) {
          refIds.push(id);
        }
      }
    }

    // Walk the reference chain, linking parent → child
    let prevContainer: Container | null = null;
    for (const refId of refIds) {
      const refContainer = getOrCreateContainer(refId);
      if (prevContainer !== null) {
        // Only set parent if the ref container doesn't already have one
        // (prefer existing parent links to avoid breaking chains)
        if (refContainer.parent === null) {
          linkParentChild(prevContainer, refContainer);
        }
      }
      prevContainer = refContainer;
    }

    // The current message's container is a child of the last reference
    if (prevContainer !== null && prevContainer !== container) {
      // If container already has a parent, prefer the explicit reference chain
      linkParentChild(prevContainer, container);
    }
  }

  // Step 3: Find the root set — containers with no parent
  const roots: Container[] = [];
  for (const container of idTable.values()) {
    if (container.parent === null) {
      roots.push(container);
    }
  }

  // Step 4: Group by subject — merge roots with same normalized subject
  const subjectMap = new Map<string, Container>();
  for (const root of roots) {
    const subject = getSubjectForContainer(root);
    const normalized = normalizeSubject(subject);
    if (!normalized) continue;

    const existing = subjectMap.get(normalized);
    if (!existing) {
      subjectMap.set(normalized, root);
    } else {
      // Keep the one that is a "real" root (has a message, or is the oldest)
      // Prefer the one that is a phantom (no message) as the root,
      // or the one with the earlier date
      if (existing.message === null && root.message !== null) {
        // existing is phantom, make root a child of existing
        linkParentChild(existing, root);
      } else if (root.message === null && existing.message !== null) {
        // root is phantom, make existing a child of root
        linkParentChild(root, existing);
        subjectMap.set(normalized, root);
      } else {
        // Both have messages — merge the newer under the older
        const existingDate = existing.message?.date ?? 0;
        const rootDate = root.message?.date ?? 0;
        if (existingDate <= rootDate) {
          linkParentChild(existing, root);
        } else {
          linkParentChild(root, existing);
          subjectMap.set(normalized, root);
        }
      }
    }
  }

  // Recompute roots after subject merging
  const finalRoots: Container[] = [];
  for (const container of idTable.values()) {
    if (container.parent === null) {
      finalRoots.push(container);
    }
  }

  // Step 5: Collect thread groups
  const threadGroups: ThreadGroup[] = [];
  const visited = new Set<Container>();

  for (const root of finalRoots) {
    const messagesInThread: ThreadableMessage[] = [];
    collectMessages(root, messagesInThread, visited);

    if (messagesInThread.length === 0) continue;

    // Sort by date ascending
    messagesInThread.sort((a, b) => a.date - b.date);

    // Find the root Message-ID for thread ID generation:
    // Use the earliest message's Message-ID
    const rootMessageId = messagesInThread[0]?.messageId ?? "";

    threadGroups.push({
      threadId: generateThreadId(rootMessageId),
      messageIds: messagesInThread.map((m) => m.id),
    });
  }

  return threadGroups;
}

/**
 * Recursively collect all real messages from a container tree.
 */
function collectMessages(
  container: Container,
  result: ThreadableMessage[],
  visited: Set<Container>,
): void {
  if (visited.has(container)) return;
  visited.add(container);

  if (container.message) {
    result.push(container.message);
  }

  for (const child of container.children) {
    collectMessages(child, result, visited);
  }
}

/**
 * Get the subject for a container (walks children if the container is a phantom).
 */
function getSubjectForContainer(container: Container): string | null {
  if (container.message?.subject) return container.message.subject;
  for (const child of container.children) {
    const s = getSubjectForContainer(child);
    if (s) return s;
  }
  return null;
}

/**
 * Given an existing set of threads and new messages,
 * incrementally update thread assignments.
 * Returns updated thread groups for affected threads only.
 */
export function updateThreads(
  existingThreads: ThreadGroup[],
  newMessages: ThreadableMessage[],
): ThreadGroup[] {
  if (newMessages.length === 0) return [];

  // We need to rebuild threads for all affected messages.
  // First, we need to know the full message set for affected threads.
  // Since we only have ThreadGroups (not full messages), we rebuild
  // by combining existing threads with new messages and re-running buildThreads.

  // Build a lookup: local message ID → threadId
  const messageToThread = new Map<string, string>();
  const threadToMessageIds = new Map<string, Set<string>>();

  for (const thread of existingThreads) {
    threadToMessageIds.set(thread.threadId, new Set(thread.messageIds));
    for (const msgId of thread.messageIds) {
      messageToThread.set(msgId, thread.threadId);
    }
  }

  // Collect all Message-IDs referenced by new messages
  const referencedMessageIds = new Set<string>();
  for (const msg of newMessages) {
    const refs = parseReferences(msg.references);
    if (msg.inReplyTo) {
      const inReplyToIds = parseReferences(msg.inReplyTo);
      for (const id of inReplyToIds) {
        refs.push(id);
      }
    }
    for (const ref of refs) {
      referencedMessageIds.add(ref);
    }
  }

  // Build all messages (existing + new) into threads from scratch
  // but only return threads that contain at least one new message
  // or that changed due to merging.

  // Since we don't have the full ThreadableMessage for existing threads,
  // we can only work with what we have. The practical approach is to
  // run buildThreads on just the new messages combined with any
  // knowledge of existing thread membership.

  // Build threads from just the new messages first
  const newThreads = buildThreads(newMessages);

  // Now check if any new message references existing threads
  const newMsgIdToMessage = new Map<string, ThreadableMessage>();
  for (const msg of newMessages) {
    newMsgIdToMessage.set(msg.messageId, msg);
  }

  // For each new thread, check if its messages reference existing thread messages
  // We check by Message-ID matching against existing thread memberships
  // Since we only have local IDs in existing threads, we need to match differently.
  // The caller would typically provide full ThreadableMessage objects.
  // For now, we check if any new message's references match existing thread messageIds.

  // Remap: check if new messages' references overlap with known Message-IDs
  // Since existingThreads only has local IDs, we need another approach.
  // We'll return the new thread groups directly, and let the caller handle merging
  // based on the threadId matching (since generateThreadId is deterministic).

  // Better approach: check if any new thread's threadId matches an existing one
  const result: ThreadGroup[] = [];
  const existingThreadIdSet = new Set(existingThreads.map((t) => t.threadId));

  for (const newThread of newThreads) {
    if (existingThreadIdSet.has(newThread.threadId)) {
      // Merge: add new message IDs to existing thread
      const existingMsgIds = threadToMessageIds.get(newThread.threadId);
      if (existingMsgIds) {
        const merged = new Set([...existingMsgIds, ...newThread.messageIds]);
        result.push({
          threadId: newThread.threadId,
          messageIds: [...merged],
        });
      } else {
        result.push(newThread);
      }
    } else {
      // Check if any new message references a message that's a root of an existing thread
      // by checking if the generated threadId from any reference matches
      let mergedIntoExisting = false;

      for (const msg of newMessages) {
        if (!newThread.messageIds.includes(msg.id)) continue;

        const refs = parseReferences(msg.references);
        if (msg.inReplyTo) {
          const inReplyToIds = parseReferences(msg.inReplyTo);
          for (const id of inReplyToIds) {
            if (!refs.includes(id)) refs.push(id);
          }
        }

        for (const ref of refs) {
          const potentialThreadId = generateThreadId(ref);
          if (existingThreadIdSet.has(potentialThreadId)) {
            // This new message references a root of an existing thread
            const existingMsgIds = threadToMessageIds.get(potentialThreadId);
            if (existingMsgIds) {
              const merged = new Set([
                ...existingMsgIds,
                ...newThread.messageIds,
              ]);
              result.push({
                threadId: potentialThreadId,
                messageIds: [...merged],
              });
              mergedIntoExisting = true;
              break;
            }
          }
        }
        if (mergedIntoExisting) break;
      }

      if (!mergedIntoExisting) {
        result.push(newThread);
      }
    }
  }

  return result;
}
