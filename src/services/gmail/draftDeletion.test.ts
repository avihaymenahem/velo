import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteDraftsForThread } from "./draftDeletion";

const mockDeleteThread = vi.fn().mockResolvedValue(undefined);

vi.mock("../db/threads", () => ({
  deleteThread: (...args: unknown[]) => mockDeleteThread(...args),
}));

function createMockClient(drafts: { id: string; message: { id: string; threadId: string } }[]) {
  return {
    listDrafts: vi.fn().mockResolvedValue(drafts),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof deleteDraftsForThread>[0];
}

describe("deleteDraftsForThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete all drafts belonging to the thread", async () => {
    const client = createMockClient([
      { id: "draft-1", message: { id: "msg-1", threadId: "thread-A" } },
      { id: "draft-2", message: { id: "msg-2", threadId: "thread-A" } },
      { id: "draft-3", message: { id: "msg-3", threadId: "thread-B" } },
    ]);

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.listDrafts).toHaveBeenCalledOnce();
    expect(client.deleteDraft).toHaveBeenCalledTimes(2);
    expect(client.deleteDraft).toHaveBeenCalledWith("draft-1");
    expect(client.deleteDraft).toHaveBeenCalledWith("draft-2");
  });

  it("should not delete drafts from other threads", async () => {
    const client = createMockClient([
      { id: "draft-1", message: { id: "msg-1", threadId: "thread-B" } },
      { id: "draft-2", message: { id: "msg-2", threadId: "thread-C" } },
    ]);

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.deleteDraft).not.toHaveBeenCalled();
  });

  it("should delete the thread from local DB after deleting drafts", async () => {
    const client = createMockClient([
      { id: "draft-1", message: { id: "msg-1", threadId: "thread-A" } },
    ]);

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(mockDeleteThread).toHaveBeenCalledWith("account-1", "thread-A");
  });

  it("should delete from local DB even when there are no matching drafts", async () => {
    const client = createMockClient([]);

    await deleteDraftsForThread(client, "account-1", "thread-A");

    expect(client.deleteDraft).not.toHaveBeenCalled();
    expect(mockDeleteThread).toHaveBeenCalledWith("account-1", "thread-A");
  });

  it("should handle single draft in thread", async () => {
    const client = createMockClient([
      { id: "draft-X", message: { id: "msg-X", threadId: "thread-A" } },
    ]);

    await deleteDraftsForThread(client, "acc-2", "thread-A");

    expect(client.deleteDraft).toHaveBeenCalledOnce();
    expect(client.deleteDraft).toHaveBeenCalledWith("draft-X");
    expect(mockDeleteThread).toHaveBeenCalledWith("acc-2", "thread-A");
  });
});
