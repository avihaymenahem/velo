import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteDraftsForThread } from "./draftDeletion";

const mockDeleteThreadDb = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/threads", () => ({
  deleteThread: (...args: unknown[]) => mockDeleteThreadDb(...args),
}));

type Draft = { id: string; message: { id: string; threadId: string } };
type ThreadMessage = { id: string; labelIds: string[] };

function createMockClient(
  drafts: Draft[],
  threadMessages: ThreadMessage[] | null = null,
) {
  return {
    listDrafts: vi.fn().mockResolvedValue(drafts),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    getThread: vi.fn().mockResolvedValue(
      threadMessages !== null ? { id: "thread-A", historyId: "1", messages: threadMessages } : null,
    ),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    modifyThread: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof deleteDraftsForThread>[0];
}

// Helper: draft-only message
const draftMsg = (id: string): ThreadMessage => ({ id, labelIds: ["DRAFT"] });
// Helper: non-draft message (e.g. a sent email in the same thread)
const sentMsg = (id: string): ThreadMessage => ({ id, labelIds: ["SENT"] });

describe("deleteDraftsForThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete all drafts returned by listDrafts", async () => {
    // listDrafts returns drafts pre-filtered by the server (q:threadId:thread-A)
    const client = createMockClient(
      [
        { id: "draft-1", message: { id: "msg-1", threadId: "thread-A" } },
        { id: "draft-2", message: { id: "msg-2", threadId: "thread-A" } },
      ],
      [draftMsg("msg-1"), draftMsg("msg-2")],
    );

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.listDrafts).toHaveBeenCalledOnce();
    expect(client.deleteDraft).toHaveBeenCalledTimes(2);
    expect(client.deleteDraft).toHaveBeenCalledWith("draft-1");
    expect(client.deleteDraft).toHaveBeenCalledWith("draft-2");
  });

  it("should pass the correct threadId query to listDrafts", async () => {
    const client = createMockClient([], []);

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.listDrafts).toHaveBeenCalledWith({ q: "threadId:thread-A" });
  });

  it("should delete the thread from local DB after deleting drafts", async () => {
    const client = createMockClient(
      [{ id: "draft-1", message: { id: "msg-1", threadId: "thread-A" } }],
      [draftMsg("msg-1")],
    );

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(mockDeleteThreadDb).toHaveBeenCalledWith("account-1", "thread-A");
  });

  it("should permanently delete a draft-only thread (avoids re-sync via History API)", async () => {
    const client = createMockClient(
      [{ id: "draft-1", message: { id: "msg-1", threadId: "thread-A" } }],
      [draftMsg("msg-1")],
    );

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.deleteThread).toHaveBeenCalledWith("thread-A");
    expect(client.modifyThread).not.toHaveBeenCalled();
  });

  it("should use modifyThread (not deleteThread) for threads that also have non-draft messages", async () => {
    // Thread has one sent email + one draft reply
    const client = createMockClient(
      [{ id: "draft-1", message: { id: "msg-2", threadId: "thread-A" } }],
      [sentMsg("msg-1"), draftMsg("msg-2")],
    );

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.modifyThread).toHaveBeenCalledWith("thread-A", [], ["DRAFT"]);
    expect(client.deleteThread).not.toHaveBeenCalled();
  });

  it("should delete from local DB even when there are no matching drafts", async () => {
    const client = createMockClient([], null); // getThread returns null (already gone)

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.deleteDraft).not.toHaveBeenCalled();
    expect(mockDeleteThreadDb).toHaveBeenCalledWith("account-1", "thread-A");
  });

  it("should handle single draft in thread", async () => {
    const client = createMockClient(
      [{ id: "draft-X", message: { id: "msg-X", threadId: "thread-A" } }],
      [draftMsg("msg-X")],
    );

    await deleteDraftsForThread(client, "acc-2", "thread-A");

    expect(client.deleteDraft).toHaveBeenCalledOnce();
    expect(client.deleteDraft).toHaveBeenCalledWith("draft-X");
    expect(mockDeleteThreadDb).toHaveBeenCalledWith("acc-2", "thread-A");
  });
});
