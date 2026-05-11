import { useState, useEffect, useCallback } from "react";
import {
  getWorkflowRules,
  upsertWorkflowRule,
  deleteWorkflowRule,
  toggleWorkflowRule,
  type DbWorkflowRule,
} from "@/services/db/workflowRules";
import { useAccountStore } from "@/stores/accountStore";
import { WorkflowRuleCard } from "./WorkflowRuleCard";
import { WorkflowTriggerPicker } from "./WorkflowTriggerPicker";
import { WorkflowActionPicker } from "./WorkflowActionPicker";

interface WorkflowAction {
  type: string;
  [key: string]: unknown;
}

export function WorkflowEditor() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [rules, setRules] = useState<DbWorkflowRule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("email_received");
  const [triggerConditions, setTriggerConditions] = useState("");
  const [actions, setActions] = useState<WorkflowAction[]>([]);

  const loadRules = useCallback(async () => {
    if (!activeAccountId) return;
    const r = await getWorkflowRules(activeAccountId);
    setRules(r);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    loadRules();
  }, [activeAccountId, loadRules]);

  const resetForm = useCallback(() => {
    setName("");
    setTriggerEvent("email_received");
    setTriggerConditions("");
    setActions([]);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !name.trim()) return;

    await upsertWorkflowRule({
      id: editingId ?? undefined,
      accountId: activeAccountId,
      name: name.trim(),
      triggerEvent,
      triggerConditions: triggerConditions || undefined,
      actions: JSON.stringify(actions),
    });

    resetForm();
    await loadRules();
  }, [activeAccountId, name, triggerEvent, triggerConditions, actions, editingId, resetForm, loadRules]);

  const handleEdit = useCallback((rule: DbWorkflowRule) => {
    setEditingId(rule.id);
    setName(rule.name);
    setTriggerEvent(rule.trigger_event);

    let parsedActions: WorkflowAction[] = [];
    try {
      parsedActions = JSON.parse(rule.actions) as WorkflowAction[];
    } catch {
      parsedActions = [];
    }
    setActions(parsedActions);
    setTriggerConditions(rule.trigger_conditions ?? "");
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteWorkflowRule(id);
    if (editingId === id) resetForm();
    await loadRules();
  }, [editingId, resetForm, loadRules]);

  const handleToggle = useCallback(async (id: string, active: boolean) => {
    await toggleWorkflowRule(id, active);
    await loadRules();
  }, [loadRules]);

  const handleTriggerChange = useCallback((event: string, conditions: string) => {
    setTriggerEvent(event);
    setTriggerConditions(conditions);
  }, []);

  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <WorkflowRuleCard
          key={rule.id}
          rule={rule}
          onToggle={handleToggle}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ))}

      {showForm ? (
        <div className="border border-border-primary rounded-md p-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name"
            className="w-full bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded border border-border-primary outline-none focus:border-accent"
          />

          <WorkflowTriggerPicker
            event={triggerEvent}
            conditions={triggerConditions}
            onChange={handleTriggerChange}
          />

          <WorkflowActionPicker
            actions={actions}
            onChange={setActions}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? "Update" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          + Add Rule
        </button>
      )}
    </div>
  );
}
