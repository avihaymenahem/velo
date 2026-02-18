import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Sparkles, Calendar, Flag } from "lucide-react";
import { extractTask } from "@/services/ai/taskExtraction";
import { insertTask, getIncompleteTaskCount } from "@/services/db/tasks";
import type { TaskPriority } from "@/services/db/tasks";
import type { DbMessage } from "@/services/db/messages";
import { useTaskStore } from "@/stores/taskStore";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "none", label: "None", color: "text-text-tertiary" },
  { value: "low", label: "Low", color: "text-blue-400" },
  { value: "medium", label: "Medium", color: "text-amber-400" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-red-500" },
];

interface AiTaskExtractDialogProps {
  threadId: string;
  accountId: string;
  messages: DbMessage[];
  onClose: () => void;
  onCreated?: (taskId: string) => void;
}

export function AiTaskExtractDialog({
  threadId,
  accountId,
  messages,
  onClose,
  onCreated,
}: AiTaskExtractDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function extract() {
      try {
        const result = await extractTask(threadId, accountId, messages);
        if (cancelled) return;
        setTitle(result.title);
        setDescription(result.description ?? "");
        setPriority(result.priority);
        if (result.dueDate) {
          const d = new Date(result.dueDate * 1000);
          setDueDate(d.toISOString().split("T")[0] ?? "");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to extract task");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    extract();
    return () => { cancelled = true; };
  }, [threadId, accountId, messages]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const dueDateTs = dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : null;
      const taskId = await insertTask({
        accountId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDateTs,
        threadId,
        threadAccountId: accountId,
      });

      // Update store count
      const count = await getIncompleteTaskCount(accountId);
      useTaskStore.getState().setIncompleteCount(count);

      onCreated?.(taskId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
      setCreating(false);
    }
  }, [title, description, priority, dueDate, accountId, threadId, onCreated, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative glass-modal rounded-xl shadow-2xl w-[480px] max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-secondary">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">Create Task from Email</h3>
          </div>
          <button onClick={onClose} className="p-1 text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 size={24} className="animate-spin text-accent" />
              <p className="text-sm text-text-secondary">Extracting task from email...</p>
            </div>
          ) : error && !title ? (
            <div className="text-center py-8">
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : (
            <>
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent resize-none"
                />
              </div>

              {/* Priority + Due Date */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    <Flag size={11} className="inline mr-1" />
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent"
                  >
                    {PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">
                    <Calendar size={11} className="inline mr-1" />
                    Due date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-lg text-sm text-text-primary outline-none focus:border-accent"
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-danger">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && title && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-secondary">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title.trim() || creating}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Task"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
