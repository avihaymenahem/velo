import { useTaskStore } from "./taskStore";
import type { DbTask } from "@/services/db/tasks";

function makeTask(overrides: Partial<DbTask> = {}): DbTask {
  return {
    id: "t1",
    account_id: "acc1",
    title: "Test task",
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
    ...overrides,
  };
}

beforeEach(() => {
  useTaskStore.setState({
    tasks: [],
    threadTasks: [],
    selectedTaskId: null,
    incompleteCount: 0,
    groupBy: "none",
    filterStatus: "incomplete",
    filterPriority: "all",
    searchQuery: "",
  });
});

describe("taskStore", () => {
  it("setTasks replaces task list", () => {
    const tasks = [makeTask(), makeTask({ id: "t2" })];
    useTaskStore.getState().setTasks(tasks);
    expect(useTaskStore.getState().tasks).toHaveLength(2);
  });

  it("addTask prepends and increments count", () => {
    useTaskStore.getState().addTask(makeTask());
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().incompleteCount).toBe(1);
  });

  it("addTask does not increment count for completed task", () => {
    useTaskStore.getState().addTask(makeTask({ is_completed: 1 }));
    expect(useTaskStore.getState().incompleteCount).toBe(0);
  });

  it("updateTaskInStore updates matching task", () => {
    useTaskStore.setState({ tasks: [makeTask()], incompleteCount: 1 });
    useTaskStore.getState().updateTaskInStore("t1", { title: "Updated" });
    expect(useTaskStore.getState().tasks[0]?.title).toBe("Updated");
  });

  it("completing a task decrements count", () => {
    useTaskStore.setState({ tasks: [makeTask()], incompleteCount: 1 });
    useTaskStore.getState().updateTaskInStore("t1", { is_completed: 1 });
    expect(useTaskStore.getState().incompleteCount).toBe(0);
  });

  it("uncompleting a task increments count", () => {
    useTaskStore.setState({
      tasks: [makeTask({ is_completed: 1 })],
      incompleteCount: 0,
    });
    useTaskStore.getState().updateTaskInStore("t1", { is_completed: 0 });
    expect(useTaskStore.getState().incompleteCount).toBe(1);
  });

  it("removeTask removes and decrements count", () => {
    useTaskStore.setState({ tasks: [makeTask()], incompleteCount: 1 });
    useTaskStore.getState().removeTask("t1");
    expect(useTaskStore.getState().tasks).toHaveLength(0);
    expect(useTaskStore.getState().incompleteCount).toBe(0);
  });

  it("removeTask clears selectedTaskId if matching", () => {
    useTaskStore.setState({ tasks: [makeTask()], selectedTaskId: "t1" });
    useTaskStore.getState().removeTask("t1");
    expect(useTaskStore.getState().selectedTaskId).toBeNull();
  });

  it("setGroupBy updates groupBy", () => {
    useTaskStore.getState().setGroupBy("priority");
    expect(useTaskStore.getState().groupBy).toBe("priority");
  });

  it("setFilterStatus updates filterStatus", () => {
    useTaskStore.getState().setFilterStatus("completed");
    expect(useTaskStore.getState().filterStatus).toBe("completed");
  });

  it("setSearchQuery updates searchQuery", () => {
    useTaskStore.getState().setSearchQuery("test");
    expect(useTaskStore.getState().searchQuery).toBe("test");
  });
});
