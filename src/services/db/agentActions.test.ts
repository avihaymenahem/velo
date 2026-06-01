import {
  createAgentAction,
  getPendingAgentActions,
  getAgentActionsForThread,
  rejectAgentAction,
} from "./agentActions";
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

describe("agentActions DB service", () => {
  it("creates a suggested agent action with serialized payload and source refs", async () => {
    const id = await createAgentAction({
      accountId: "acc1",
      threadId: "t1",
      kind: "suggest_work_state",
      level: "suggest",
      status: "suggested",
      title: "Mark as waiting",
      payload: { primaryState: "waiting" },
      sourceRefs: [{ messageId: "m1" }],
    });

    expect(id).toBeTruthy();
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO agent_actions"),
      expect.arrayContaining([
        "acc1",
        "t1",
        null,
        "suggest_work_state",
        "suggest",
        "suggested",
        "low",
        "Mark as waiting",
        null,
        JSON.stringify({ primaryState: "waiting" }),
        JSON.stringify([{ messageId: "m1" }]),
      ]),
    );
  });

  it("lists pending review actions ordered by risk and recency", async () => {
    mockDb.select.mockResolvedValue([]);

    await getPendingAgentActions("acc1");

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('suggested', 'prepared', 'approved')"),
      ["acc1"],
    );
  });

  it("lists actions for a thread", async () => {
    mockDb.select.mockResolvedValue([]);

    await getAgentActionsForThread("acc1", "t1");

    expect(mockDb.select).toHaveBeenCalledWith(
      expect.stringContaining("account_id = $1 AND thread_id = $2"),
      ["acc1", "t1"],
    );
  });

  it("rejects an action with reviewer and reason", async () => {
    await rejectAgentAction("action1", "user", "not relevant");

    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'rejected'"),
      ["user", "not relevant", "action1"],
    );
  });
});
