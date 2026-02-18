import { create } from "zustand";
import type { DbTask, TaskPriority } from "@/services/db/tasks";

export type TaskGroupBy = "none" | "priority" | "dueDate" | "tag";
export type TaskFilterStatus = "all" | "incomplete" | "completed";

interface TaskState {
  tasks: DbTask[];
  threadTasks: DbTask[];
  selectedTaskId: string | null;
  incompleteCount: number;
  groupBy: TaskGroupBy;
  filterStatus: TaskFilterStatus;
  filterPriority: TaskPriority | "all";
  searchQuery: string;

  setTasks: (tasks: DbTask[]) => void;
  setThreadTasks: (tasks: DbTask[]) => void;
  addTask: (task: DbTask) => void;
  updateTaskInStore: (id: string, updates: Partial<DbTask>) => void;
  removeTask: (id: string) => void;
  setSelectedTaskId: (id: string | null) => void;
  setIncompleteCount: (count: number) => void;
  setGroupBy: (groupBy: TaskGroupBy) => void;
  setFilterStatus: (status: TaskFilterStatus) => void;
  setFilterPriority: (priority: TaskPriority | "all") => void;
  setSearchQuery: (query: string) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  threadTasks: [],
  selectedTaskId: null,
  incompleteCount: 0,
  groupBy: "none",
  filterStatus: "incomplete",
  filterPriority: "all",
  searchQuery: "",

  setTasks: (tasks) => set({ tasks }),
  setThreadTasks: (threadTasks) => set({ threadTasks }),
  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
      incompleteCount: task.is_completed ? state.incompleteCount : state.incompleteCount + 1,
    })),
  updateTaskInStore: (id, updates) =>
    set((state) => {
      const updateList = (list: DbTask[]) =>
        list.map((t) => (t.id === id ? { ...t, ...updates } : t));
      let countDelta = 0;
      if (updates.is_completed !== undefined) {
        const existing = state.tasks.find((t) => t.id === id) ?? state.threadTasks.find((t) => t.id === id);
        if (existing) {
          if (updates.is_completed && !existing.is_completed) countDelta = -1;
          if (!updates.is_completed && existing.is_completed) countDelta = 1;
        }
      }
      return {
        tasks: updateList(state.tasks),
        threadTasks: updateList(state.threadTasks),
        incompleteCount: state.incompleteCount + countDelta,
      };
    }),
  removeTask: (id) =>
    set((state) => {
      const removed = state.tasks.find((t) => t.id === id);
      const countDelta = removed && !removed.is_completed ? -1 : 0;
      return {
        tasks: state.tasks.filter((t) => t.id !== id),
        threadTasks: state.threadTasks.filter((t) => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        incompleteCount: state.incompleteCount + countDelta,
      };
    }),
  setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
  setIncompleteCount: (incompleteCount) => set({ incompleteCount }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setFilterPriority: (priority) => set({ filterPriority: priority }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));
