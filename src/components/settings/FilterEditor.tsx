import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Pencil } from "lucide-react";
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
} from "@/services/db/filters";

export function FilterEditor() {
  const { t } = useTranslation("settings");
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [filters, setFilters] = useState<DbFilterRule[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [criteriaFrom, setCriteriaFrom] = useState("");
  const [criteriaTo, setCriteriaTo] = useState("");
  const [criteriaSubject, setCriteriaSubject] = useState("");
  const [criteriaBody, setCriteriaBody] = useState("");
  const [criteriaHasAttachment, setCriteriaHasAttachment] = useState(false);
  const [actionLabel, setActionLabel] = useState("");
  const [actionArchive, setActionArchive] = useState(false);
  const [actionStar, setActionStar] = useState(false);
  const [actionMarkRead, setActionMarkRead] = useState(false);
  const [actionTrash, setActionTrash] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadFilters is stable, only re-run on activeAccountId change
  }, [activeAccountId]);

  const resetForm = useCallback(() => {
    setName("");
    setCriteriaFrom("");
    setCriteriaTo("");
    setCriteriaSubject("");
    setCriteriaBody("");
    setCriteriaHasAttachment(false);
    setActionLabel("");
    setActionArchive(false);
    setActionStar(false);
    setActionMarkRead(false);
    setActionTrash(false);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const buildCriteria = (): FilterCriteria => {
    const c: FilterCriteria = {};
    if (criteriaFrom.trim()) c.from = criteriaFrom.trim();
    if (criteriaTo.trim()) c.to = criteriaTo.trim();
    if (criteriaSubject.trim()) c.subject = criteriaSubject.trim();
    if (criteriaBody.trim()) c.body = criteriaBody.trim();
    if (criteriaHasAttachment) c.hasAttachment = true;
    return c;
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
      await updateFilter(editingId, { name: name.trim(), criteria, actions });
    } else {
      await insertFilter({
        accountId: activeAccountId,
        name: name.trim(),
        criteria,
        actions,
      });
    }

    resetForm();
    await loadFilters();
  }, [activeAccountId, name, editingId, resetForm, loadFilters, criteriaFrom, criteriaTo, criteriaSubject, criteriaBody, criteriaHasAttachment, actionLabel, actionArchive, actionStar, actionMarkRead, actionTrash]);

  const handleEdit = useCallback((filter: DbFilterRule) => {
    setEditingId(filter.id);
    setName(filter.name);

    let criteria: FilterCriteria = {};
    let actions: FilterActions = {};
    try { criteria = JSON.parse(filter.criteria_json); } catch { /* empty */ }
    try { actions = JSON.parse(filter.actions_json); } catch { /* empty */ }

    setCriteriaFrom(criteria.from ?? "");
    setCriteriaTo(criteria.to ?? "");
    setCriteriaSubject(criteria.subject ?? "");
    setCriteriaBody(criteria.body ?? "");
    setCriteriaHasAttachment(criteria.hasAttachment ?? false);
    setActionLabel(actions.applyLabel ?? "");
    setActionArchive(actions.archive ?? false);
    setActionStar(actions.star ?? false);
    setActionMarkRead(actions.markRead ?? false);
    setActionTrash(actions.trash ?? false);
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
        const parts: string[] = [];
        if (c.from) parts.push(`${t("filterEditor.from")} ${c.from}`);
        if (c.to) parts.push(`${t("filterEditor.to")} ${c.to}`);
        if (c.subject) parts.push(`${t("filterEditor.subject")} ${c.subject}`);
        if (c.body) parts.push(`${t("filterEditor.body")} ${c.body}`);
        if (c.hasAttachment) parts.push(t("filterEditor.hasAttachmentSummary"));
        map.set(filter.id, parts.join(", ") || t("filterEditor.noCriteria"));
      } catch {
        map.set(filter.id, t("filterEditor.invalidCriteria"));
      }
    }
    return map;
  }, [filters, t]);

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
                  {t("filterEditor.disabled")}
                </span>
              )}
            </div>
            <div className="text-xs text-text-tertiary truncate">
              {filterDescriptions.get(filter.id) ?? t("filterEditor.noCriteria")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggleEnabled(filter)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                filter.is_enabled === 1 ? "bg-accent" : "bg-bg-tertiary"
              }`}
              title={filter.is_enabled === 1 ? t("filterEditor.disable") : t("filterEditor.enable")}
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
            placeholder={t("filterEditor.filterName")}
          />

          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">{t("filterEditor.matchCriteria")}</div>
            <div className="space-y-1.5">
              <TextField
                type="text"
                value={criteriaFrom}
                onChange={(e) => setCriteriaFrom(e.target.value)}
                placeholder={t("filterEditor.fromPlaceholder")}
              />
              <TextField
                type="text"
                value={criteriaTo}
                onChange={(e) => setCriteriaTo(e.target.value)}
                placeholder={t("filterEditor.toPlaceholder")}
              />
              <TextField
                type="text"
                value={criteriaSubject}
                onChange={(e) => setCriteriaSubject(e.target.value)}
                placeholder={t("filterEditor.subjectPlaceholder")}
              />
              <TextField
                type="text"
                value={criteriaBody}
                onChange={(e) => setCriteriaBody(e.target.value)}
                placeholder={t("filterEditor.bodyPlaceholder")}
              />
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={criteriaHasAttachment}
                  onChange={(e) => setCriteriaHasAttachment(e.target.checked)}
                  className="rounded"
                />
                {t("filterEditor.hasAttachment")}
              </label>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">{t("filterEditor.actions")}</div>
            <div className="space-y-1.5">
              {labels.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-20">{t("filterEditor.applyLabel")}</span>
                  <select
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                  >
                    <option value="">{t("filterEditor.none")}</option>
                    {labels.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionArchive} onChange={(e) => setActionArchive(e.target.checked)} className="rounded" />
                  {t("filterEditor.archive")}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionStar} onChange={(e) => setActionStar(e.target.checked)} className="rounded" />
                  {t("filterEditor.star")}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionMarkRead} onChange={(e) => setActionMarkRead(e.target.checked)} className="rounded" />
                  {t("filterEditor.markAsRead")}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={actionTrash} onChange={(e) => setActionTrash(e.target.checked)} className="rounded" />
                  {t("filterEditor.trash")}
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? t("filterEditor.update") : t("filterEditor.save")}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              {t("filterEditor.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {t("filterEditor.addFilter")}
        </button>
      )}
    </div>
  );
}
