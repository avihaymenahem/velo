import {
  getThreadWorkState,
  getThreadWorkStatesForThreads,
  setThreadPrimaryState,
  upsertThreadWorkState,
} from "./threadWorkStates";
import { getDb } from "./connection";

vi.mock("./connection", () => ({
  getDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockResolvedValue(mockDb as never);
});

describe("threadWorkStates DB service", () => {
  it("fetches a single thread work state by compound thread key", async () => {
    const row = { account_id: "acc1", thread_id: "t1", primary_state: "needs_reply" };
    mockDb.select.mockResolvedValue([row]);

    const result = await getThreadWorkState("acc1", "t1");

    expect(result).toEqual(row);
    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("account_id = $1 AND thread_id = $2"),
      ["acc1", "t1"],
    );
  });

  it("batch fetches visible thread states with bound placeholders", async () => {
    mockDb.select.mockResolvedValue([
      { thread_id: "t1", primary_state: "waiting" },
      { thread_id: "t2", primary_state: "done" },
    ]);

    const result = await getThreadWorkStatesForThreads("acc1", ["t1", "t2"]);

    expect(result.get("t1")?.primary_state).toBe("waiting");
    expect(result.get("t2")?.primary_state).toBe("done");
    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("thread_id IN ($2,$3)"),
      ["acc1", "t1", "t2"],
    );
  });

  it("upserts a manual state with local-only defaults", async () => {
    mockDb.select.mockResolvedValue([]);

    await setThreadPrimaryState("acc1", "t1", "waiting");

    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO thread_work_states"),
      expect.arrayContaining(["acc1", "t1", "waiting", "normal", "low", "manual"]),
    );
  });

  it("does not let an agent suggestion overwrite a manual state", async () => {
    mockDb.select.mockResolvedValue([
      { account_id: "acc1", thread_id: "t1", primary_state: "needs_reply", source: "manual" },
    ]);

    await upsertThreadWorkState({
      accountId: "acc1",
      threadId: "t1",
      primaryState: "can_archive",
      source: "agent_suggested",
    });

    expect(mockDb.execute).not.toHaveBeenCalled();
  });
});
