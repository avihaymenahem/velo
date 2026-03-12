import { describe, it, expect, beforeEach } from "vitest";
import { useThreadStore, threadKey, parseThreadKey, type Thread } from "./threadStore";

const mockThread: Thread = {
  id: "thread-1",
  accountId: "acc-1",
  subject: "Test Subject",
  snippet: "This is a test...",
  lastMessageAt: 1700000000,
  messageCount: 3,
  isRead: false,
  isStarred: false,
  isPinned: false,
  isMuted: false,
  hasAttachments: false,
  labelIds: ["INBOX"],
  fromName: "John Doe",
  fromAddress: "john@example.com",
};

const mockThread2: Thread = {
  id: "thread-2",
  accountId: "acc-1",
  subject: "Another Thread",
  snippet: "Another preview...",
  lastMessageAt: 1700001000,
  messageCount: 1,
  isRead: true,
  isStarred: true,
  isPinned: false,
  isMuted: false,
  hasAttachments: true,
  labelIds: ["INBOX", "STARRED"],
  fromName: "Jane Smith",
  fromAddress: "jane@example.com",
};

const key1 = threadKey(mockThread); // "acc-1:thread-1"
const key2 = threadKey(mockThread2); // "acc-1:thread-2"

describe("threadKey / parseThreadKey", () => {
  it("produces accountId:id format", () => {
    expect(threadKey({ accountId: "acc-1", id: "t1" })).toBe("acc-1:t1");
  });

  it("round-trips through parseThreadKey", () => {
    const key = threadKey({ accountId: "acc-1", id: "thread-99" });
    expect(parseThreadKey(key)).toEqual({ accountId: "acc-1", threadId: "thread-99" });
  });

  it("handles thread IDs containing colons", () => {
    const key = threadKey({ accountId: "acc-1", id: "imap-acc-1-INBOX-42" });
    const parsed = parseThreadKey(key);
    expect(parsed.accountId).toBe("acc-1");
    expect(parsed.threadId).toBe("imap-acc-1-INBOX-42");
  });

  it("handles accountId containing special characters", () => {
    const key = threadKey({ accountId: "user@gmail.com", id: "t1" });
    const parsed = parseThreadKey(key);
    expect(parsed.accountId).toBe("user@gmail.com");
    expect(parsed.threadId).toBe("t1");
  });

  it("disambiguates threads with same ID from different accounts", () => {
    const key1 = threadKey({ accountId: "acc-1", id: "t1" });
    const key2 = threadKey({ accountId: "acc-2", id: "t1" });
    expect(key1).not.toBe(key2);
  });
});

describe("threadStore", () => {
  beforeEach(() => {
    useThreadStore.setState({
      threads: [],
      threadMap: new Map(),
      selectedThreadId: null,
      selectedThreadIds: new Set(),
      isLoading: false,
    });
  });

  it("should start with empty threads", () => {
    const state = useThreadStore.getState();
    expect(state.threads).toHaveLength(0);
    expect(state.selectedThreadId).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("should set threads", () => {
    useThreadStore.getState().setThreads([mockThread, mockThread2]);
    expect(useThreadStore.getState().threads).toHaveLength(2);
  });

  it("should select a thread", () => {
    useThreadStore.getState().setThreads([mockThread]);
    useThreadStore.getState().selectThread(key1);
    expect(useThreadStore.getState().selectedThreadId).toBe(key1);
  });

  it("should deselect a thread", () => {
    useThreadStore.getState().selectThread(key1);
    useThreadStore.getState().selectThread(null);
    expect(useThreadStore.getState().selectedThreadId).toBeNull();
  });

  it("should set loading state", () => {
    useThreadStore.getState().setLoading(true);
    expect(useThreadStore.getState().isLoading).toBe(true);
  });

  it("should select all threads", () => {
    useThreadStore.getState().setThreads([mockThread, mockThread2]);
    useThreadStore.getState().selectAll();
    const state = useThreadStore.getState();
    expect(state.selectedThreadIds.size).toBe(2);
    expect(state.selectedThreadIds.has(key1)).toBe(true);
    expect(state.selectedThreadIds.has(key2)).toBe(true);
  });

  it("should select all threads from the selected thread onward", () => {
    const mockThread3: Thread = {
      ...mockThread,
      id: "thread-3",
      subject: "Third Thread",
    };
    const key3 = threadKey(mockThread3);
    useThreadStore.getState().setThreads([mockThread, mockThread2, mockThread3]);
    useThreadStore.getState().selectThread(key2);
    useThreadStore.getState().selectAllFromHere();
    const state = useThreadStore.getState();
    // Should select thread-2 and thread-3 (from index 1 onward)
    expect(state.selectedThreadIds.size).toBe(2);
    expect(state.selectedThreadIds.has(key2)).toBe(true);
    expect(state.selectedThreadIds.has(key3)).toBe(true);
    expect(state.selectedThreadIds.has(key1)).toBe(false);
  });

  it("should select all from beginning when no thread is selected", () => {
    useThreadStore.getState().setThreads([mockThread, mockThread2]);
    useThreadStore.getState().selectAllFromHere();
    const state = useThreadStore.getState();
    expect(state.selectedThreadIds.size).toBe(2);
  });

  it("should merge selectAllFromHere with existing selection", () => {
    const mockThread3: Thread = {
      ...mockThread,
      id: "thread-3",
      subject: "Third Thread",
    };
    useThreadStore.getState().setThreads([mockThread, mockThread2, mockThread3]);
    // Select thread-2 as the current thread
    useThreadStore.getState().selectThread(key2);
    // Manually add thread-1 to multi-select (after selectThread since it clears multiselect)
    useThreadStore.getState().toggleThreadSelection(key1);
    // Now selectAllFromHere should merge with the existing selection
    useThreadStore.getState().selectAllFromHere();
    const state = useThreadStore.getState();
    // Should have thread-1 (from toggle) + thread-2, thread-3 (from selectAllFromHere)
    expect(state.selectedThreadIds.size).toBe(3);
  });

  describe("threadMap", () => {
    it("should build threadMap when setting threads", () => {
      useThreadStore.getState().setThreads([mockThread, mockThread2]);
      const { threadMap } = useThreadStore.getState();
      expect(threadMap.size).toBe(2);
      expect(threadMap.get(key1)).toBe(useThreadStore.getState().threads[0]);
      expect(threadMap.get(key2)).toBe(useThreadStore.getState().threads[1]);
    });

    it("should return undefined for non-existent thread in threadMap", () => {
      useThreadStore.getState().setThreads([mockThread]);
      expect(useThreadStore.getState().threadMap.get("non-existent")).toBeUndefined();
    });

    it("should update threadMap when updating a thread", () => {
      useThreadStore.getState().setThreads([mockThread, mockThread2]);
      useThreadStore.getState().updateThread(key1, { isRead: true });
      const { threadMap } = useThreadStore.getState();
      expect(threadMap.get(key1)?.isRead).toBe(true);
      expect(threadMap.get(key2)?.isRead).toBe(true); // was already true
    });

    it("should remove from threadMap when removing a thread", () => {
      useThreadStore.getState().setThreads([mockThread, mockThread2]);
      useThreadStore.getState().removeThread(key1);
      const { threadMap } = useThreadStore.getState();
      expect(threadMap.size).toBe(1);
      expect(threadMap.has(key1)).toBe(false);
      expect(threadMap.has(key2)).toBe(true);
    });

    it("should remove from threadMap when removing multiple threads", () => {
      const mockThread3: Thread = { ...mockThread, id: "thread-3" };
      const key3 = threadKey(mockThread3);
      useThreadStore.getState().setThreads([mockThread, mockThread2, mockThread3]);
      useThreadStore.getState().removeThreads([key1, key3]);
      const { threadMap } = useThreadStore.getState();
      expect(threadMap.size).toBe(1);
      expect(threadMap.has(key2)).toBe(true);
    });

    it("should start with empty threadMap", () => {
      expect(useThreadStore.getState().threadMap.size).toBe(0);
    });
  });

  it("should update a specific thread", () => {
    useThreadStore.getState().setThreads([mockThread, mockThread2]);
    useThreadStore.getState().updateThread(key1, { isRead: true, isStarred: true });

    const updated = useThreadStore.getState().threads.find((t) => t.id === "thread-1");
    expect(updated?.isRead).toBe(true);
    expect(updated?.isStarred).toBe(true);
    expect(updated?.subject).toBe("Test Subject"); // unchanged

    // Other thread should be untouched
    const other = useThreadStore.getState().threads.find((t) => t.id === "thread-2");
    expect(other?.isRead).toBe(true); // was already true
  });

  describe("multi-account threads", () => {
    const threadAcct2: Thread = {
      ...mockThread,
      id: "thread-1", // same ID as mockThread, different account
      accountId: "acc-2",
      subject: "From account 2",
    };
    const keyAcct2 = threadKey(threadAcct2);

    it("should store threads with same ID from different accounts separately", () => {
      useThreadStore.getState().setThreads([mockThread, threadAcct2]);
      const { threadMap } = useThreadStore.getState();
      expect(threadMap.size).toBe(2);
      expect(threadMap.get(key1)?.subject).toBe("Test Subject");
      expect(threadMap.get(keyAcct2)?.subject).toBe("From account 2");
    });

    it("should update only the correct account's thread when IDs collide", () => {
      useThreadStore.getState().setThreads([mockThread, threadAcct2]);
      useThreadStore.getState().updateThread(keyAcct2, { isStarred: true });
      const { threadMap } = useThreadStore.getState();
      expect(threadMap.get(key1)?.isStarred).toBe(false);
      expect(threadMap.get(keyAcct2)?.isStarred).toBe(true);
    });

    it("should remove only the correct account's thread when IDs collide", () => {
      useThreadStore.getState().setThreads([mockThread, threadAcct2]);
      useThreadStore.getState().removeThread(key1);
      const { threadMap, threads } = useThreadStore.getState();
      expect(threads).toHaveLength(1);
      expect(threadMap.has(key1)).toBe(false);
      expect(threadMap.has(keyAcct2)).toBe(true);
    });
  });
});
