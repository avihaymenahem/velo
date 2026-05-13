import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, Pencil, Plus, Minus, FlaskConical, Check, X } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { useAccountStore } from "@/stores/accountStore";
import { getLabelsForAccount, type DbLabel } from "@/services/db/labels";
import {
  getFiltersForAccount,
  insertFilter,
  updateFilter,
  deleteFilter,
  type DbFilterRule,
  type FilterCriteria,
  type FilterActions,
  type FilterConditionInput,
} from "@/services/db/filters";
import { FilterTestDialog } from "./FilterTestDialog";

const FIELDS: { value: FilterConditionInput["field"]; label: string }[] = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
];

const OPERATORS: { value: FilterConditionInput["operator"]; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "matches", label: "Matches regex" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "not_contains", label: "Does not contain" },
];

const CHAINING_OPTIONS: { value: string; label: string }[] = [
  { value: "stop", label: "Stop" },
  { value: "continue", label: "Continue" },
  { value: "continue_on_match", label: "Continue on match" },
  { value: "continue_on_no_match", label: "Continue on no match" },
];

function isValidRegex(pattern: string): boolean {
  if (!pattern) return true;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function getRegexPreview(pattern: string): string | null {
  if (!pattern) return null;
  try {
    const regex = new RegExp(pattern, "i");
    const sampleText = "Sample text to test: Alice Smith <alice@example.com> Project Update 123";
    const match = sampleText.match(regex);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}

export function FilterEditor() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [filters, setFilters] = useState<DbFilterRule[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [conditions, setConditions] = useState<FilterConditionInput[]>([{ field: "from", operator: "contains", value: "" }]);
  const [matchType, setMatchType] = useState<"all" | "any">("all");
  const [actionLabel, setActionLabel] = useState("");
  const [actionArchive, setActionArchive] = useState(false);
  const [actionStar, setActionStar] = useState(false);
  const [actionMarkRead, setActionMarkRead] = useState(false);
  const [actionTrash, setActionTrash] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState("");
  const [chainingAction, setChainingAction] = useState("stop");

  const [testRuleId, setTestRuleId] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    if (!activeAccountId) return;
    const f = await getFiltersForAccount(activeAccountId);
    setFilters(f);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    loadFilters();
    getLabelsForAccount(activeAccountId).then((l) =>
      setLabels(l.filter((lb) => lb.type === "user")),
    );
  }, [activeAccountId, loadFilters]);

  const resetForm = useCallback(() => {
    setName("");
    setConditions([{ field: "from", operator: "contains", value: "" }]);
    setMatchType("all");
    setActionLabel("");
    setActionArchive(false);
    setActionStar(false);
    setActionMarkRead(false);
    setActionTrash(false);
    setScoreThreshold("");
    setChainingAction("stop");
    setEditingId(null);
    setShowForm(false);
  }, []);

  const buildCriteria = (): FilterCriteria => {
    const validConds = conditions.filter((c) => c.value.trim());
    const condsWithWeight = validConds.map((c) => ({
      ...c,
      weight: c.weight && c.weight !== 1 ? c.weight : undefined,
    }));
    return {
      conditions: condsWithWeight.length > 0 ? condsWithWeight : undefined,
      matchType: condsWithWeight.length > 1 ? matchType : undefined,
    };
  };

  const buildActions = (): FilterActions => {
    const a: FilterActions = {};
    if (actionLabel) a.applyLabel = actionLabel;
    if (actionArchive) a.archive = true;
    if (actionStar) a.star = true;
    if (actionMarkRead) a.markRead = true;
    if (actionTrash) a.trash = true;
    return a;
  };

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !name.trim()) return;
    const criteria = buildCriteria();
    const actions = buildActions();

    if (editingId) {
      await updateFilter(editingId, {
        name: name.trim(),
        criteria,
        actions,
        scoreThreshold: scoreThreshold ? parseFloat(scoreThreshold) : null,
        chainingAction,
      });
    } else {
      await insertFilter({
        accountId: activeAccountId,
        name: name.trim(),
        criteria,
        actions,
        scoreThreshold: scoreThreshold ? parseFloat(scoreThreshold) : undefined,
        chainingAction,
      });
    }

    resetForm();
    await loadFilters();
  }, [activeAccountId, name, editingId, resetForm, loadFilters, conditions, matchType, actionLabel, actionArchive, actionStar, actionMarkRead, actionTrash, scoreThreshold, chainingAction]);

  const handleEdit = useCallback((filter: DbFilterRule) => {
    setEditingId(filter.id);
    setName(filter.name);

    let criteria: FilterCriteria = {};
    let actions: FilterActions = {};
    try { criteria = JSON.parse(filter.criteria_json); } catch { /* empty */ }
    try { actions = JSON.parse(filter.actions_json); } catch { /* empty */ }

    if (criteria.conditions && criteria.conditions.length > 0) {
      setConditions(criteria.conditions.map((c) => ({ ...c })));
      setMatchType(criteria.matchType ?? "all");
    } else {
      const conds: FilterConditionInput[] = [];
      if (criteria.from) conds.push({ field: "from", operator: "contains", value: criteria.from });
      if (criteria.to) conds.push({ field: "to", operator: "contains", value: criteria.to });
      if (criteria.subject) conds.push({ field: "subject", operator: "contains", value: criteria.subject });
      if (criteria.body) conds.push({ field: "body", operator: "contains", value: criteria.body });
      setConditions(conds.length > 0 ? conds : [{ field: "from", operator: "contains", value: "" }]);
      setMatchType("all");
    }

    setActionLabel(actions.applyLabel ?? "");
    setActionArchive(actions.archive ?? false);
    setActionStar(actions.star ?? false);
    setActionMarkRead(actions.markRead ?? false);
    setActionTrash(actions.trash ?? false);
    setScoreThreshold(filter.score_threshold != null ? String(filter.score_threshold) : "");
    setChainingAction(filter.chaining_action ?? "stop");
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteFilter(id);
    if (editingId === id) resetForm();
    await loadFilters();
  }, [editingId, resetForm, loadFilters]);

  const handleToggleEnabled = useCallback(async (filter: DbFilterRule) => {
    await updateFilter(filter.id, { isEnabled: filter.is_enabled !== 1 });
    await loadFilters();
  }, [loadFilters]);

  const filterDescriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const filter of filters) {
      try {
        const c = JSON.parse(filter.criteria_json) as FilterCriteria;
        if (c.conditions && c.conditions.length > 0) {
          const parts = c.conditions.map((cond) => {
            const w = (cond as any).weight;
            const weightStr = w && w !== 1 ? ` [x${w}]` : "";
            return `${cond.field} ${cond.operator} "${cond.value}"${weightStr}`;
          });
          map.set(filter.id, parts.join(c.matchType === "any" ? " OR " : " AND ") || "No criteria");
        } else {
          const parts: string[] = [];
          if (c.from) parts.push(`from: ${c.from}`);
          if (c.to) parts.push(`to: ${c.to}`);
          if (c.subject) parts.push(`subject: ${c.subject}`);
          if (c.body) parts.push(`body: ${c.body}`);
          if (c.hasAttachment) parts.push("has attachment");
          map.set(filter.id, parts.join(", ") || "No criteria");
        }
      } catch {
        map.set(filter.id, "Invalid criteria");
      }
    }
    return map;
  }, [filters]);

  const updateCondition = (index: number, updates: Partial<FilterConditionInput>) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...updates } : c)),
    );
  };

  const addCondition = () => {
    setConditions((prev) => [...prev, { field: "from", operator: "contains", value: "" }]);
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {filters.map((filter) => (
        <div
          key={filter.id}
          className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary flex items-center gap-2">
              {filter.name}
              {filter.is_enabled !== 1 && (
                <span className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
                  Disabled
                </span>
              )}
              {filter.chaining_action && filter.chaining_action !== "stop" && (
                <span className="text-[0.625rem] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                  {filter.chaining_action}
                </span>
              )}
              {filter.score_threshold != null && (
                <span className="text-[0.625rem] bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                  threshold: {filter.score_threshold}
                </span>
              )}
            </div>
            <div className="text-xs text-text-tertiary truncate">
              {filterDescriptions.get(filter.id) ?? "No criteria"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTestRuleId(filter.id)}
              className="p-1 text-text-tertiary hover:text-accent"
              title="Test filter"
            >
              <FlaskConical size={13} />
            </button>
            <button
              onClick={() => handleToggleEnabled(filter)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                filter.is_enabled === 1 ? "bg-accent" : "bg-bg-tertiary"
              }`}
              title={filter.is_enabled === 1 ? "Disable" : "Enable"}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow ${
                  filter.is_enabled === 1 ? "translate-x-4" : ""
                }`}
              />
            </button>
            <button
              onClick={() => handleEdit(filter)}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => handleDelete(filter.id)}
              className="p-1 text-text-tertiary hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-border-primary rounded-md p-3 space-y-3">
          <TextField
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Filter name"
          />

          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">
              Match criteria
              {conditions.length > 1 && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <button
                    onClick={() => setMatchType("all")}
                    className={`px-1.5 py-0.5 text-[0.625rem] rounded ${
                      matchType === "all"
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-text-tertiary hover:text-text-primary"
                    }`}
                  >
                    AND
                  </button>
                  <button
                    onClick={() => setMatchType("any")}
                    className={`px-1.5 py-0.5 text-[0.625rem] rounded ${
                      matchType === "any"
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-text-tertiary hover:text-text-primary"
                    }`}
                  >
                    OR
                  </button>
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {conditions.map((cond, idx) => {
                const isRegex = cond.operator === "matches";
                const regexValid = isRegex && cond.value ? isValidRegex(cond.value) : true;
                const previewText = isRegex && cond.value && regexValid ? getRegexPreview(cond.value) : null;
                return (
                  <div key={idx} className="flex items-center gap-1.5">
                    <select
                      value={cond.field}
                      onChange={(e) => updateCondition(idx, { field: e.target.value as FilterConditionInput["field"] })}
                      className="bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent w-20"
                    >
                      {FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      value={cond.operator}
                      onChange={(e) => updateCondition(idx, { operator: e.target.value as FilterConditionInput["operator"] })}
                      className="bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent w-32"
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={cond.value}
                        onChange={(e) => updateCondition(idx, { value: e.target.value })}
                        placeholder="Value..."
                        className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent pr-6"
                      />
                      {isRegex && cond.value && (
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          {regexValid ? (
                            <Check size={14} className="text-success" />
                          ) : (
                            <X size={14} className="text-danger" />
                          )}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={(cond as any).weight ?? 1}
                      onChange={(e) => updateCondition(idx, { weight: parseFloat(e.target.value) || 1 })}
                      placeholder="Wt"
                      className="w-14 bg-bg-tertiary text-text-primary text-xs px-1.5 py-1.5 rounded border border-border-primary outline-none focus:border-accent"
                      title="Weight (default 1.0)"
                      min="0"
                      step="0.5"
                    />
                    {isRegex && previewText && (
                      <span className="text-[0.625rem] text-accent truncate max-w-[100px]" title={previewText}>
                        "{previewText}"
                      </span>
                    )}
                    <button
                      onClick={() => removeCondition(idx)}
                      disabled={conditions.length <= 1}
                      className="p-1 text-text-tertiary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Minus size={14} />
                    </button>
                    {idx === conditions.length - 1 && (
                      <button
                        onClick={addCondition}
                        className="p-1 text-text-tertiary hover:text-accent"
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">Actions</div>
            <div className="space-y-1.5">
              {labels.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20">Apply label</span>
                  <select
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                  >
                    <option value="">None</option>
                    {labels.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionArchive} onChange={(e) => setActionArchive(e.target.checked)} className="rounded" />
                  Archive
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionStar} onChange={(e) => setActionStar(e.target.checked)} className="rounded" />
                  Star
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionMarkRead} onChange={(e) => setActionMarkRead(e.target.checked)} className="rounded" />
                  Mark as read
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionTrash} onChange={(e) => setActionTrash(e.target.checked)} className="rounded" />
                  Trash
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-medium text-text-secondary block mb-1">Score threshold</span>
              <input
                type="number"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(e.target.value)}
                placeholder="e.g. 2.0"
                min="0"
                step="0.5"
                className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <span className="text-xs font-medium text-text-secondary block mb-1">Chaining action</span>
              <select
                value={chainingAction}
                onChange={(e) => setChainingAction(e.target.value)}
                className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent"
              >
                {CHAINING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

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
          + Add filter
        </button>
      )}

      {testRuleId && (
        <FilterTestDialog
          isOpen={true}
          onClose={() => setTestRuleId(null)}
          ruleId={testRuleId}
        />
      )}
    </div>
  );
}
