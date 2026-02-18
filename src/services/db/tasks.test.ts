import {
  getTasksForAccount,
  getTaskById,
  getTasksForThread,
  getSubtasks,
  insertTask,
  updateTask,
  deleteTask,
  completeTask,
  uncompleteTask,
  reorderTasks,
  getIncompleteTaskCount,
  getTaskTags,
  upsertTaskTag,
  deleteTaskTag,
} from "./tasks";
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

describe("tasks DB service", () => {
  describe("getTasksForAccount", () => {
    it("fetches incomplete tasks by default", async () => {
      mockDb.select.mockResolvedValue([]);
      await getTasksForAccount("acc1");
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("is_completed = 0"),
        ["acc1"],
      );
    });

    it("includes completed tasks when requested", async () => {
      mockDb.select.mockResolvedValue([]);
      await getTasksForAccount("acc1", true);
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.not.stringContaining("is_completed = 0"),
        ["acc1"],
      );
    });
  });

  describe("getTaskById", () => {
    it("returns task when found", async () => {
      const task = { id: "t1", title: "Test" };
      mockDb.select.mockResolvedValue([task]);
      const result = await getTaskById("t1");
      expect(result).toEqual(task);
    });

    it("returns null when not found", async () => {
      mockDb.select.mockResolvedValue([]);
      const result = await getTaskById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getTasksForThread", () => {
    it("queries by thread_account_id and thread_id", async () => {
      mockDb.select.mockResolvedValue([]);
      await getTasksForThread("acc1", "thread1");
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("thread_account_id = $1 AND thread_id = $2"),
        ["acc1", "thread1"],
      );
    });
  });

  describe("getSubtasks", () => {
    it("queries by parent_id", async () => {
      mockDb.select.mockResolvedValue([]);
      await getSubtasks("parent1");
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("parent_id = $1"),
        ["parent1"],
      );
    });
  });

  describe("insertTask", () => {
    it("inserts a task with defaults", async () => {
      const id = await insertTask({ accountId: "acc1", title: "Buy milk" });
      expect(id).toBeTruthy();
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tasks"),
        expect.arrayContaining(["acc1", "Buy milk"]),
      );
    });

    it("uses provided id if given", async () => {
      const id = await insertTask({ id: "custom-id", accountId: "acc1", title: "Test" });
      expect(id).toBe("custom-id");
    });
  });

  describe("updateTask", () => {
    it("updates specified fields", async () => {
      await updateTask("t1", { title: "Updated", priority: "high" });
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tasks SET"),
        expect.arrayContaining(["Updated", "high", "t1"]),
      );
    });
  });

  describe("deleteTask", () => {
    it("deletes by id", async () => {
      await deleteTask("t1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM tasks WHERE id = $1",
        ["t1"],
      );
    });
  });

  describe("completeTask", () => {
    it("sets is_completed and completed_at", async () => {
      await completeTask("t1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("is_completed = 1"),
        ["t1"],
      );
    });
  });

  describe("uncompleteTask", () => {
    it("clears is_completed and completed_at", async () => {
      await uncompleteTask("t1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("is_completed = 0"),
        ["t1"],
      );
    });
  });

  describe("reorderTasks", () => {
    it("updates sort_order for each task", async () => {
      await reorderTasks(["t1", "t2", "t3"]);
      expect(mockDb.execute).toHaveBeenCalledTimes(3);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("sort_order = $1"),
        [0, "t1"],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("sort_order = $1"),
        [2, "t3"],
      );
    });
  });

  describe("getIncompleteTaskCount", () => {
    it("returns count", async () => {
      mockDb.select.mockResolvedValue([{ count: 5 }]);
      const result = await getIncompleteTaskCount("acc1");
      expect(result).toBe(5);
    });
  });

  describe("task tags", () => {
    it("getTaskTags queries correctly", async () => {
      mockDb.select.mockResolvedValue([]);
      await getTaskTags("acc1");
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("upsertTaskTag inserts with color", async () => {
      await upsertTaskTag("urgent", "acc1", "#ff0000");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO task_tags"),
        ["urgent", "acc1", "#ff0000"],
      );
    });

    it("deleteTaskTag removes tag", async () => {
      await deleteTaskTag("urgent", "acc1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM task_tags"),
        ["urgent", "acc1"],
      );
    });
  });
});
