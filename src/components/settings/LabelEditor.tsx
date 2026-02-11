import { useState, useEffect, useCallback } from "react";
import { Trash2, Pencil, ChevronUp, ChevronDown, X } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useLabelStore, type Label } from "@/stores/labelStore";
import { LabelForm } from "@/components/labels/LabelForm";

export function LabelEditor() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const { labels, loadLabels, deleteLabel, reorderLabels } = useLabelStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeAccountId) {
      loadLabels(activeAccountId);
    }
  }, [activeAccountId, loadLabels]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }, []);

  const handleEdit = useCallback((label: Label) => {
    setEditingId(label.id);
    setShowForm(true);
    setError(null);
  }, []);

  const handleDelete = useCallback(async (label: Label) => {
    if (!activeAccountId) return;
    setError(null);
    try {
      await deleteLabel(activeAccountId, label.id);
      if (editingId === label.id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete label");
    }
  }, [activeAccountId, deleteLabel, editingId, resetForm]);

  const handleMoveUp = useCallback(async (index: number) => {
    if (!activeAccountId || index === 0) return;
    const newOrder = labels.map((l) => l.id);
    const a = newOrder[index - 1]!;
    const b = newOrder[index]!;
    newOrder[index - 1] = b;
    newOrder[index] = a;
    await reorderLabels(activeAccountId, newOrder);
  }, [activeAccountId, labels, reorderLabels]);

  const handleMoveDown = useCallback(async (index: number) => {
    if (!activeAccountId || index >= labels.length - 1) return;
    const newOrder = labels.map((l) => l.id);
    const a = newOrder[index]!;
    const b = newOrder[index + 1]!;
    newOrder[index] = b;
    newOrder[index + 1] = a;
    await reorderLabels(activeAccountId, newOrder);
  }, [activeAccountId, labels, reorderLabels]);

  const editingLabel = editingId ? labels.find((l) => l.id === editingId) ?? null : null;

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-danger/10 text-danger text-xs rounded-md">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      {labels.length === 0 && !showForm && (
        <p className="text-sm text-text-tertiary">No user labels</p>
      )}

      {labels.map((label, index) => (
        <div key={label.id}>
          <div className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {label.colorBg ? (
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: label.colorBg }}
                />
              ) : (
                <span className="w-3 h-3 rounded-full shrink-0 bg-text-tertiary/30" />
              )}
              <span className="text-sm font-medium text-text-primary truncate">
                {label.name}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={() => handleMoveDown(index)}
                disabled={index === labels.length - 1}
                className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown size={13} />
              </button>
              <button
                onClick={() => handleEdit(label)}
                className="p-1 text-text-tertiary hover:text-text-primary"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDelete(label)}
                className="p-1 text-text-tertiary hover:text-danger"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          {/* Inline edit form under the label being edited */}
          {showForm && editingId === label.id && activeAccountId && (
            <div className="mt-1">
              <LabelForm
                accountId={activeAccountId}
                label={editingLabel}
                onDone={resetForm}
              />
            </div>
          )}
        </div>
      ))}

      {/* New label form at bottom */}
      {showForm && !editingId && activeAccountId ? (
        <LabelForm
          accountId={activeAccountId}
          onDone={resetForm}
        />
      ) : !showForm && (
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setError(null); }}
          className="text-xs text-accent hover:text-accent-hover"
        >
          + Add label
        </button>
      )}
    </div>
  );
}
