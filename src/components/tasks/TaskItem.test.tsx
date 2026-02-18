import { render, screen, fireEvent } from "@testing-library/react";
import { TaskItem } from "./TaskItem";
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

describe("TaskItem", () => {
  it("renders task title", () => {
    render(
      <TaskItem
        task={makeTask({ title: "Buy groceries" })}
        onToggleComplete={vi.fn()}
      />,
    );
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("shows completed styling", () => {
    render(
      <TaskItem
        task={makeTask({ is_completed: 1, title: "Done task" })}
        onToggleComplete={vi.fn()}
      />,
    );
    const title = screen.getByText("Done task");
    expect(title.className).toContain("line-through");
  });

  it("calls onToggleComplete when checkbox clicked", () => {
    const onToggle = vi.fn();
    render(
      <TaskItem
        task={makeTask()}
        onToggleComplete={onToggle}
      />,
    );
    // Click the circle button (first button in the component)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!);
    expect(onToggle).toHaveBeenCalledWith("t1", true);
  });

  it("renders tags", () => {
    render(
      <TaskItem
        task={makeTask({ tags_json: '["urgent","work"]' })}
        onToggleComplete={vi.fn()}
      />,
    );
    expect(screen.getByText("urgent")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
  });

  it("shows due date badge", () => {
    const tomorrow = Math.floor(Date.now() / 1000) + 86400;
    render(
      <TaskItem
        task={makeTask({ due_date: tomorrow })}
        onToggleComplete={vi.fn()}
      />,
    );
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });
});
