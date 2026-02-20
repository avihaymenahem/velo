import { useState, useEffect, useCallback } from "react";
import { Trash2, Pencil, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { useAccountStore } from "@/stores/accountStore";
import { getLabelsForAccount, type DbLabel } from "@/services/db/labels";
import {
  getSmartLabelRulesForAccount,
  insertSmartLabelRule,
  updateSmartLabelRule,
  deleteSmartLabelRule,
  type DbSmartLabelRule,
} from "@/services/db/smartLabelRules";
import type { FilterCriteria } from "@/services/db/filters";
import { backfillSmartLabels } from "@/services/smartLabels/backfillService";

export function SmartLabelEditor() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [rules, setRules] = useState<DbSmartLabelRule[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCriteria, setShowCriteria] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  // Form state
  const [labelId, setLabelId] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [criteriaFrom, setCriteriaFrom] = useState("");
  const [criteriaTo, setCriteriaTo] = useState("");
  const [criteriaSubject, setCriteriaSubject] = useState("");
  const [criteriaBody, setCriteriaBody] = useState("");
  const [criteriaHasAttachment, setCriteriaHasAttachment] = useState(false);

  const loadRules = useCallback(async () => {
    if (!activeAccountId) return;
    const r = await getSmartLabelRulesForAccount(activeAccountId);
    setRules(r);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    loadRules();
    getLabelsForAccount(activeAccountId).then((l) =>
      setLabels(l.filter((lb) => lb.type === "user")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadRules is stable
  }, [activeAccountId]);

  const resetForm = useCallback(() => {
    setLabelId("");
    setAiDescription("");
    setCriteriaFrom("");
    setCriteriaTo("");
    setCriteriaSubject("");
    setCriteriaBody("");
    setCriteriaHasAttachment(false);
    setShowCriteria(false);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const buildCriteria = (): FilterCriteria | undefined => {
    const c: FilterCriteria = {};
    if (criteriaFrom.trim()) c.from = criteriaFrom.trim();
    if (criteriaTo.trim()) c.to = criteriaTo.trim();
    if (criteriaSubject.trim()) c.subject = criteriaSubject.trim();
    if (criteriaBody.trim()) c.body = criteriaBody.trim();
    if (criteriaHasAttachment) c.hasAttachment = true;
    return Object.keys(c).length > 0 ? c : undefined;
  };

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !labelId || !aiDescription.trim()) return;
    const criteria = buildCriteria();

    if (editingId) {
      await updateSmartLabelRule(editingId, {
        labelId,
        aiDescription: aiDescription.trim(),
        criteria: criteria ?? null,
      });
    } else {
      await insertSmartLabelRule({
        accountId: activeAccountId,
        labelId,
        aiDescription: aiDescription.trim(),
        criteria,
      });
    }

    resetForm();
    await loadRules();
  }, [activeAccountId, labelId, aiDescription, editingId, resetForm, loadRules, criteriaFrom, criteriaTo, criteriaSubject, criteriaBody, criteriaHasAttachment]);

  const handleEdit = useCallback((rule: DbSmartLabelRule) => {
    setEditingId(rule.id);
    setLabelId(rule.label_id);
    setAiDescription(rule.ai_description);

    let criteria: FilterCriteria = {};
    if (rule.criteria_json) {
      try { criteria = JSON.parse(rule.criteria_json); } catch { /* empty */ }
    }

    setCriteriaFrom(criteria.from ?? "");
    setCriteriaTo(criteria.to ?? "");
    setCriteriaSubject(criteria.subject ?? "");
    setCriteriaBody(criteria.body ?? "");
    setCriteriaHasAttachment(criteria.hasAttachment ?? false);
    setShowCriteria(Object.keys(criteria).length > 0);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSmartLabelRule(id);
    if (editingId === id) resetForm();
    await loadRules();
  }, [editingId, resetForm, loadRules]);

  const handleToggleEnabled = useCallback(async (rule: DbSmartLabelRule) => {
    await updateSmartLabelRule(rule.id, { isEnabled: rule.is_enabled !== 1 });
    await loadRules();
  }, [loadRules]);

  const handleBackfill = useCallback(async () => {
    if (!activeAccountId || backfilling) return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const count = await backfillSmartLabels(activeAccountId);
      setBackfillResult(`Applied ${count} label${count !== 1 ? "s" : ""} to existing emails.`);
    } catch (err) {
      setBackfillResult("Backfill failed. Check your AI provider settings.");
      console.error("Smart label backfill failed:", err);
    } finally {
      setBackfilling(false);
    }
  }, [activeAccountId, backfilling]);

  const getLabelName = useCallback(
    (id: string) => labels.find((l) => l.id === id)?.name ?? id,
    [labels],
  );

  return (
    <div className="space-y-3">
      {rules.length > 0 && (
        <button
          onClick={handleBackfill}
          disabled={backfilling}
          className="text-xs text-accent hover:text-accent-hover disabled:opacity-50 flex items-center gap-1.5"
        >
          {backfilling && <Loader2 size={12} className="animate-spin" />}
          {backfilling ? "Applying to existing emails..." : "Apply to existing emails"}
        </button>
      )}

      {backfillResult && (
        <div className="text-xs text-text-tertiary">{backfillResult}</div>
      )}

      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary flex items-center gap-2">
              {getLabelName(rule.label_id)}
              {rule.is_enabled !== 1 && (
                <span className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
                  Disabled
                </span>
              )}
            </div>
            <div className="text-xs text-text-tertiary truncate">
              {rule.ai_description}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggleEnabled(rule)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                rule.is_enabled === 1 ? "bg-accent" : "bg-bg-tertiary"
              }`}
              title={rule.is_enabled === 1 ? "Disable" : "Enable"}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow ${
                  rule.is_enabled === 1 ? "translate-x-4" : ""
                }`}
              />
            </button>
            <button
              onClick={() => handleEdit(rule)}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => handleDelete(rule.id)}
              className="p-1 text-text-tertiary hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-border-primary rounded-md p-3 space-y-3">
          {labels.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-text-secondary mb-1.5">Label</div>
              <select
                value={labelId}
                onChange={(e) => setLabelId(e.target.value)}
                className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary"
              >
                <option value="">Select a label...</option>
                {labels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-text-tertiary">
              No user labels found. Create a label first.
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">AI Description</div>
            <textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              placeholder="e.g., Job applications and career opportunities"
              rows={2}
              className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary resize-none placeholder:text-text-tertiary"
            />
          </div>

          <div>
            <button
              onClick={() => setShowCriteria(!showCriteria)}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
            >
              {showCriteria ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Optional filter criteria
            </button>

            {showCriteria && (
              <div className="mt-2 space-y-1.5">
                <TextField
                  type="text"
                  value={criteriaFrom}
                  onChange={(e) => setCriteriaFrom(e.target.value)}
                  placeholder="From contains..."
                />
                <TextField
                  type="text"
                  value={criteriaTo}
                  onChange={(e) => setCriteriaTo(e.target.value)}
                  placeholder="To contains..."
                />
                <TextField
                  type="text"
                  value={criteriaSubject}
                  onChange={(e) => setCriteriaSubject(e.target.value)}
                  placeholder="Subject contains..."
                />
                <TextField
                  type="text"
                  value={criteriaBody}
                  onChange={(e) => setCriteriaBody(e.target.value)}
                  placeholder="Body contains..."
                />
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={criteriaHasAttachment}
                    onChange={(e) => setCriteriaHasAttachment(e.target.checked)}
                    className="rounded"
                  />
                  Has attachment
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!labelId || !aiDescription.trim()}
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
          + Add smart label
        </button>
      )}
    </div>
  );
}
