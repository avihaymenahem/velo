import { Trash2, Plus } from "lucide-react";

interface WorkflowAction {
  type: string;
  [key: string]: unknown;
}

interface WorkflowActionPickerProps {
  actions: WorkflowAction[];
  onChange: (actions: WorkflowAction[]) => void;
}

const ACTION_TYPES = [
  { value: "apply_label", label: "Apply Label" },
  { value: "send_template", label: "Send Template" },
  { value: "create_task", label: "Create Task" },
  { value: "mark_read", label: "Mark Read" },
  { value: "archive", label: "Archive" },
  { value: "star", label: "Star" },
  { value: "forward_to", label: "Forward To" },
];

export function WorkflowActionPicker({ actions, onChange }: WorkflowActionPickerProps) {
  const addAction = (type: string) => {
    const action: WorkflowAction = { type };
    if (type === "apply_label") action.labelId = "";
    if (type === "send_template") action.templateId = "";
    if (type === "create_task") action.title = "";
    if (type === "forward_to") action.email = "";
    onChange([...actions, action]);
  };

  const updateAction = (index: number, update: Partial<WorkflowAction>) => {
    const next = actions.map((a, i) => (i === index ? { ...a, ...update } : a));
    onChange(next);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const unusedTypes = ACTION_TYPES.filter((t) => !actions.some((a) => a.type === t.value));

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-text-secondary mb-1">Actions</div>
      {actions.length === 0 && (
        <p className="text-xs text-text-tertiary">No actions configured.</p>
      )}
      {actions.map((action, index) => (
        <div
          key={index}
          className="flex items-start gap-2 py-1.5 px-2 bg-bg-tertiary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <select
              value={action.type}
              onChange={(e) => {
                const newType = e.target.value;
                const newAction: WorkflowAction = { type: newType };
                if (newType === "apply_label") newAction.labelId = "";
                if (newType === "send_template") newAction.templateId = "";
                if (newType === "create_task") newAction.title = "";
                if (newType === "forward_to") newAction.email = "";
                updateAction(index, newAction);
              }}
              className="w-full bg-bg-secondary text-text-primary text-xs px-2 py-1 rounded border border-border-primary mb-1"
            >
              {ACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {action.type === "apply_label" && (
              <input
                type="text"
                value={(action.labelId as string) ?? ""}
                onChange={(e) => updateAction(index, { labelId: e.target.value })}
                placeholder="Label ID"
                className="w-full bg-bg-secondary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
              />
            )}
            {action.type === "send_template" && (
              <input
                type="text"
                value={(action.templateId as string) ?? ""}
                onChange={(e) => updateAction(index, { templateId: e.target.value })}
                placeholder="Template ID"
                className="w-full bg-bg-secondary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
              />
            )}
            {action.type === "create_task" && (
              <div className="space-y-1">
                <input
                  type="text"
                  value={(action.title as string) ?? ""}
                  onChange={(e) => updateAction(index, { title: e.target.value })}
                  placeholder="Task title"
                  className="w-full bg-bg-secondary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[0.625rem] text-text-tertiary">Due in</span>
                  <input
                    type="number"
                    min={0}
                    value={(action.dueDays as number) ?? ""}
                    onChange={(e) => updateAction(index, { dueDays: Number(e.target.value) })}
                    placeholder="days"
                    className="w-16 bg-bg-secondary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
                  />
                  <span className="text-[0.625rem] text-text-tertiary">days</span>
                </div>
              </div>
            )}
            {action.type === "forward_to" && (
              <input
                type="email"
                value={(action.email as string) ?? ""}
                onChange={(e) => updateAction(index, { email: e.target.value })}
                placeholder="forward@example.com"
                className="w-full bg-bg-secondary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
              />
            )}
          </div>
          <button
            onClick={() => removeAction(index)}
            className="p-1 text-text-tertiary hover:text-danger shrink-0 mt-1"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {unusedTypes.length > 0 && (
        <div className="relative">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addAction(e.target.value);
              e.target.value = "";
            }}
            className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary appearance-none cursor-pointer"
          >
            <option value="">+ Add Action</option>
            {unusedTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <Plus size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
        </div>
      )}
    </div>
  );
}
