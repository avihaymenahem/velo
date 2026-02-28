import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Pencil, Plus, GripVertical, ChevronDown } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { getLabelsForAccount, type DbLabel } from "@/services/db/labels";
import {
  getQuickStepsForAccount,
  insertQuickStep,
  updateQuickStep,
  deleteQuickStep,
  type DbQuickStep,
} from "@/services/db/quickSteps";
import {
  ACTION_TYPE_METADATA,
  type QuickStepAction,
  type QuickStepActionType,
} from "@/services/quickSteps/types";
import { ALL_CATEGORIES } from "@/services/db/threadCategories";
import { seedDefaultQuickSteps } from "@/services/quickSteps/defaults";

function describeActions(actionsJson: string, invalidLabel: string): string {
  try {
    const actions = JSON.parse(actionsJson) as QuickStepAction[];
    return actions
      .map((a) => {
        const meta = ACTION_TYPE_METADATA.find((m) => m.type === a.type);
        let label = meta?.label ?? a.type;
        if (a.params?.labelId) label += ` (${a.params.labelId})`;
        if (a.params?.category) label += ` (${a.params.category})`;
        return label;
      })
      .join(" -> ");
  } catch {
    return invalidLabel;
  }
}

export function QuickStepEditor() {
  const { t } = useTranslation("settings");
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [quickSteps, setQuickSteps] = useState<DbQuickStep[]>([]);
  const [labels, setLabels] = useState<DbLabel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [icon, setIcon] = useState("");
  const [continueOnError, setContinueOnError] = useState(false);
  const [actions, setActions] = useState<QuickStepAction[]>([]);

  const loadQuickSteps = useCallback(async () => {
    if (!activeAccountId) return;
    // Seed defaults if needed
    await seedDefaultQuickSteps(activeAccountId);
    const qs = await getQuickStepsForAccount(activeAccountId);
    setQuickSteps(qs);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    loadQuickSteps();
    getLabelsForAccount(activeAccountId).then((l) =>
      setLabels(l.filter((lb) => lb.type === "user")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadQuickSteps is stable, only re-run on activeAccountId change
  }, [activeAccountId]);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setShortcut("");
    setIcon("");
    setContinueOnError(false);
    setActions([]);
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !name.trim() || actions.length === 0) return;

    if (editingId) {
      await updateQuickStep(editingId, {
        name: name.trim(),
        description: description.trim() || undefined,
        shortcut: shortcut.trim() || null,
        icon: icon.trim() || undefined,
        continueOnError,
        actions,
      });
    } else {
      await insertQuickStep({
        accountId: activeAccountId,
        name: name.trim(),
        description: description.trim() || undefined,
        shortcut: shortcut.trim() || undefined,
        icon: icon.trim() || undefined,
        continueOnError,
        actions,
      });
    }

    resetForm();
    await loadQuickSteps();
  }, [activeAccountId, name, description, shortcut, icon, continueOnError, actions, editingId, resetForm, loadQuickSteps]);

  const handleEdit = useCallback((qs: DbQuickStep) => {
    setEditingId(qs.id);
    setName(qs.name);
    setDescription(qs.description ?? "");
    setShortcut(qs.shortcut ?? "");
    setIcon(qs.icon ?? "");
    setContinueOnError(qs.continue_on_error === 1);

    try {
      setActions(JSON.parse(qs.actions_json) as QuickStepAction[]);
    } catch {
      setActions([]);
    }

    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteQuickStep(id);
    if (editingId === id) resetForm();
    await loadQuickSteps();
  }, [editingId, resetForm, loadQuickSteps]);

  const handleToggleEnabled = useCallback(async (qs: DbQuickStep) => {
    await updateQuickStep(qs.id, { isEnabled: qs.is_enabled !== 1 });
    await loadQuickSteps();
  }, [loadQuickSteps]);

  const addAction = useCallback(() => {
    setActions((prev) => [...prev, { type: "archive" }]);
  }, []);

  const removeAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateAction = useCallback((index: number, type: QuickStepActionType) => {
    setActions((prev) => {
      const next = [...prev];
      const meta = ACTION_TYPE_METADATA.find((m) => m.type === type);
      next[index] = { type, ...(meta?.requiresParams ? { params: {} } : {}) };
      return next;
    });
  }, []);

  const updateActionParams = useCallback((index: number, params: QuickStepAction["params"]) => {
    setActions((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing) {
        next[index] = { ...existing, params: { ...existing.params, ...params } };
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {quickSteps.map((qs) => (
        <div
          key={qs.id}
          className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GripVertical size={12} className="text-text-tertiary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary flex items-center gap-2">
                {qs.name}
                {qs.shortcut && (
                  <kbd className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded border border-border-primary font-mono">
                    {qs.shortcut}
                  </kbd>
                )}
                {qs.is_enabled !== 1 && (
                  <span className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
                    {t("quickStepEditor.disabled")}
                  </span>
                )}
              </div>
              <div className="text-xs text-text-tertiary truncate">
                {describeActions(qs.actions_json, t("quickStepEditor.invalidActions"))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggleEnabled(qs)}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                qs.is_enabled === 1 ? "bg-accent" : "bg-bg-tertiary"
              }`}
              title={qs.is_enabled === 1 ? t("quickStepEditor.disable") : t("quickStepEditor.enable")}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform shadow ${
                  qs.is_enabled === 1 ? "translate-x-4" : ""
                }`}
              />
            </button>
            <button
              onClick={() => handleEdit(qs)}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => handleDelete(qs.id)}
              className="p-1 text-text-tertiary hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-border-primary rounded-md p-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("quickStepEditor.quickStepName")}
            className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("quickStepEditor.descriptionOptional")}
            className="w-full px-3 py-1 bg-bg-tertiary border border-border-primary rounded text-xs text-text-primary outline-none focus:border-accent"
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-text-secondary block mb-1">{t("quickStepEditor.shortcutOptional")}</label>
              <input
                type="text"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder={t("quickStepEditor.shortcutPlaceholder")}
                className="w-full px-3 py-1 bg-bg-tertiary border border-border-primary rounded text-xs text-text-primary outline-none focus:border-accent font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-text-secondary block mb-1">{t("quickStepEditor.iconOptional")}</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder={t("quickStepEditor.iconPlaceholder")}
                className="w-full px-3 py-1 bg-bg-tertiary border border-border-primary rounded text-xs text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">{t("quickStepEditor.actionChain")}</div>
            <div className="space-y-2">
              {actions.map((action, index) => {
                const needsLabelParam = action.type === "applyLabel" || action.type === "removeLabel";
                const needsCategoryParam = action.type === "moveToCategory";
                const needsSnoozeDuration = action.type === "snooze";

                return (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-xs text-text-tertiary mt-1.5 w-5 text-right shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1 space-y-1">
                      <div className="relative">
                        <select
                          value={action.type}
                          onChange={(e) => updateAction(index, e.target.value as QuickStepActionType)}
                          className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary appearance-none pr-6"
                        >
                          {ACTION_TYPE_METADATA.map((m) => (
                            <option key={m.type} value={m.type}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
                      </div>
                      {needsLabelParam && labels.length > 0 && (
                        <select
                          value={action.params?.labelId ?? ""}
                          onChange={(e) => updateActionParams(index, { labelId: e.target.value })}
                          className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                        >
                          <option value="">{t("quickStepEditor.selectLabel")}</option>
                          {labels.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      )}
                      {needsCategoryParam && (
                        <select
                          value={action.params?.category ?? ""}
                          onChange={(e) => updateActionParams(index, { category: e.target.value })}
                          className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                        >
                          <option value="">{t("quickStepEditor.selectCategory")}</option>
                          {ALL_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      )}
                      {needsSnoozeDuration && (
                        <select
                          value={action.params?.snoozeDuration ?? ""}
                          onChange={(e) => updateActionParams(index, { snoozeDuration: Number(e.target.value) })}
                          className="w-full bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
                        >
                          <option value="">{t("quickStepEditor.selectDuration")}</option>
                          <option value={3600000}>{t("quickStepEditor.duration1h")}</option>
                          <option value={14400000}>{t("quickStepEditor.duration4h")}</option>
                          <option value={86400000}>{t("quickStepEditor.durationTomorrow")}</option>
                          <option value={172800000}>{t("quickStepEditor.duration2d")}</option>
                          <option value={604800000}>{t("quickStepEditor.duration1w")}</option>
                        </select>
                      )}
                    </div>
                    <button
                      onClick={() => removeAction(index)}
                      className="p-1 text-text-tertiary hover:text-danger mt-0.5"
                      title={t("quickStepEditor.removeAction")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={addAction}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover mt-2"
            >
              <Plus size={12} />
              {t("quickStepEditor.addAction")}
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={continueOnError}
              onChange={(e) => setContinueOnError(e.target.checked)}
              className="rounded"
            />
            {t("quickStepEditor.continueOnError")}
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!name.trim() || actions.length === 0}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? t("quickStepEditor.update") : t("quickStepEditor.save")}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              {t("quickStepEditor.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          {t("quickStepEditor.addQuickStep")}
        </button>
      )}
    </div>
  );
}
