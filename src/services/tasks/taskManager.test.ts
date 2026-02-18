import {
  calculateNextOccurrence,
  parseRecurrenceRule,
  handleRecurringTaskCompletion,
  type RecurrenceRule,
} from "./taskManager";

vi.mock("@/services/db/tasks", () => ({
  getTaskById: vi.fn(),
  completeTask: vi.fn(),
  insertTask: vi.fn().mockResolvedValue("new-task-id"),
  updateTask: vi.fn(),
}));

const { getTaskById, completeTask, insertTask } = await import("@/services/db/tasks");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("taskManager", () => {
  describe("parseRecurrenceRule", () => {
    it("parses valid JSON", () => {
      const rule = parseRecurrenceRule('{"type":"weekly","interval":1}');
      expect(rule).toEqual({ type: "weekly", interval: 1 });
    });

    it("returns null for null input", () => {
      expect(parseRecurrenceRule(null)).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseRecurrenceRule("not json")).toBeNull();
    });
  });

  describe("calculateNextOccurrence", () => {
    it("adds days for daily recurrence", () => {
      const from = new Date("2025-01-15T12:00:00Z");
      const rule: RecurrenceRule = { type: "daily", interval: 3 };
      const next = calculateNextOccurrence(from, rule);
      expect(next.getDate()).toBe(18);
    });

    it("adds weeks for weekly recurrence", () => {
      const from = new Date("2025-01-15T12:00:00Z");
      const rule: RecurrenceRule = { type: "weekly", interval: 2 };
      const next = calculateNextOccurrence(from, rule);
      expect(next.getDate()).toBe(29);
    });

    it("adds months for monthly recurrence", () => {
      const from = new Date("2025-01-15T12:00:00Z");
      const rule: RecurrenceRule = { type: "monthly", interval: 1 };
      const next = calculateNextOccurrence(from, rule);
      expect(next.getMonth()).toBe(1); // February
    });

    it("adds years for yearly recurrence", () => {
      const from = new Date("2025-01-15T12:00:00Z");
      const rule: RecurrenceRule = { type: "yearly", interval: 1 };
      const next = calculateNextOccurrence(from, rule);
      expect(next.getFullYear()).toBe(2026);
    });
  });

  describe("handleRecurringTaskCompletion", () => {
    it("returns null if task not found", async () => {
      vi.mocked(getTaskById).mockResolvedValue(null);
      const result = await handleRecurringTaskCompletion("nonexistent");
      expect(result).toBeNull();
    });

    it("completes task and returns null if no recurrence rule", async () => {
      vi.mocked(getTaskById).mockResolvedValue({
        id: "t1",
        account_id: "acc1",
        title: "Test",
        description: null,
        priority: "none",
        is_completed: 0,
        completed_at: null,
        due_date: null,
        parent_id: null,
        thread_id: null,
        thread_account_id: null,
        sort_order: 0,
        recurrence_rule: null,
        next_recurrence_at: null,
        tags_json: "[]",
        created_at: 1000,
        updated_at: 1000,
      });
      const result = await handleRecurringTaskCompletion("t1");
      expect(completeTask).toHaveBeenCalledWith("t1");
      expect(result).toBeNull();
    });

    it("creates next occurrence for recurring task", async () => {
      vi.mocked(getTaskById).mockResolvedValue({
        id: "t1",
        account_id: "acc1",
        title: "Weekly meeting",
        description: "Team standup",
        priority: "medium",
        is_completed: 0,
        completed_at: null,
        due_date: Math.floor(new Date("2025-01-15").getTime() / 1000),
        parent_id: null,
        thread_id: null,
        thread_account_id: null,
        sort_order: 0,
        recurrence_rule: '{"type":"weekly","interval":1}',
        next_recurrence_at: null,
        tags_json: '["work"]',
        created_at: 1000,
        updated_at: 1000,
      });

      const result = await handleRecurringTaskCompletion("t1");
      expect(completeTask).toHaveBeenCalledWith("t1");
      expect(insertTask).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: "acc1",
          title: "Weekly meeting",
          recurrenceRule: '{"type":"weekly","interval":1}',
        }),
      );
      expect(result).toBe("new-task-id");
    });
  });
});
