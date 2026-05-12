import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ChevronUp, ChevronDown, Clock } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import {
  getSnoozePresets,
  upsertSnoozePreset,
  deleteSnoozePreset,
  type SnoozePreset,
} from "@/services/db/snoozePresets";
import { TextField } from "@/components/ui/TextField";

interface SnoozePresetFormProps {
  preset?: SnoozePreset;
  onSave: (preset: {
    id?: string;
    label: string;
    durationMinutes: number;
    isRecurring: boolean;
  }) => void;
  onCancel: () => void;
}

function SnoozePresetForm({ preset, onSave, onCancel }: SnoozePresetFormProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(preset?.label ?? "");
  const [hours, setHours] = useState(
    preset ? Math.floor(preset.duration_minutes / 60) : 0,
  );
  const [minutes, setMinutes] = useState(
    preset ? preset.duration_minutes % 60 : 30,
  );
  const [isRecurring, setIsRecurring] = useState(
    preset ? preset.is_recurring === 1 : false,
  );

  const handleSubmit = () => {
    if (!label.trim()) return;
    onSave({
      id: preset?.id,
      label: label.trim(),
      durationMinutes: hours * 60 + minutes,
      isRecurring,
    });
  };

  return (
    <div className="border border-border-primary rounded-md p-3 space-y-3">
      <TextField
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t("snooze.presetName")}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={hours}
          onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
          min={0}
          className="w-20 bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent"
        />
        <span className="text-text-secondary text-xs">h</span>
        <input
          type="number"
          value={minutes}
          onChange={(e) =>
            setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))
          }
          min={0}
          max={59}
          className="w-20 bg-bg-tertiary text-text-primary text-xs px-2 py-1.5 rounded border border-border-primary outline-none focus:border-accent"
        />
        <span className="text-text-secondary text-xs">min</span>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
          className="rounded border-border-primary text-accent"
        />
        <span>{t("snooze.recurring")}</span>
      </label>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!label.trim()}
          className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
        >
          {preset ? t("common.update") : t("common.save")}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

export function SnoozePresetsEditor() {
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [presets, setPresets] = useState<SnoozePreset[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    const ps = await getSnoozePresets(activeAccountId);
    setPresets(ps);
  }, [activeAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setShowForm(false);
  }, []);

  const handleSave = useCallback(
    async (data: {
      id?: string;
      label: string;
      durationMinutes: number;
      isRecurring: boolean;
    }) => {
      if (!activeAccountId) return;
      await upsertSnoozePreset({
        id: data.id,
        accountId: activeAccountId,
        label: data.label,
        durationMinutes: data.durationMinutes,
        isRecurring: data.isRecurring,
        sortOrder: editingId
          ? presets.find((p) => p.id === editingId)?.sort_order ?? 0
          : presets.length,
      });
      resetForm();
      await load();
    },
    [activeAccountId, editingId, presets, resetForm, load],
  );

  const handleEdit = useCallback((preset: SnoozePreset) => {
    setEditingId(preset.id);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteSnoozePreset(id);
      if (editingId === id) resetForm();
      await load();
    },
    [editingId, resetForm, load],
  );

  const moveItem = useCallback(
    async (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= presets.length) return;
      const items = [...presets];
      const a = items[index]!;
      const b = items[target]!;
      const tempOrder = a.sort_order;
      items[index] = { ...a, sort_order: b.sort_order };
      items[target] = { ...b, sort_order: tempOrder };
      setPresets(items);
      await upsertSnoozePreset({
        id: a.id,
        accountId: a.account_id,
        label: a.label,
        durationMinutes: a.duration_minutes,
        isRecurring: a.is_recurring === 1,
        sortOrder: b.sort_order,
      });
      await upsertSnoozePreset({
        id: b.id,
        accountId: b.account_id,
        label: b.label,
        durationMinutes: b.duration_minutes,
        isRecurring: b.is_recurring === 1,
        sortOrder: a.sort_order,
      });
    },
    [presets],
  );

  return (
    <div className="space-y-3">
      {presets.map((preset, idx) => (
        <div
          key={preset.id}
          className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary flex items-center gap-2">
              <Clock size={13} className="text-accent" />
              {preset.label}
            </div>
            <div className="text-xs text-text-tertiary truncate mt-0.5">
              {preset.duration_minutes < 60
                ? `${preset.duration_minutes} min`
                : `${Math.floor(preset.duration_minutes / 60)}h ${preset.duration_minutes % 60}min`}
              {preset.is_recurring === 1 && (
                <span className="ml-1.5 italic">
                  {t("snooze.recurringLower")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => moveItem(idx, -1)}
              disabled={idx === 0}
              className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronUp size={13} />
            </button>
            <button
              onClick={() => moveItem(idx, 1)}
              disabled={idx === presets.length - 1}
              className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronDown size={13} />
            </button>
            <button
              onClick={() => handleEdit(preset)}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <span className="text-[0.65rem] font-medium">✎</span>
            </button>
            <button
              onClick={() => handleDelete(preset.id)}
              className="p-1 text-text-tertiary hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <SnoozePresetForm
          preset={editingId
            ? presets.find((p) => p.id === editingId)
            : undefined}
          onSave={handleSave}
          onCancel={resetForm}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <Plus size={13} />
          {t("snooze.addPreset")}
        </button>
      )}
    </div>
  );
}