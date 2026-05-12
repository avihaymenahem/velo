import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ChevronUp, ChevronDown, Zap, Pencil } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { TextField } from "@/components/ui/TextField";
import {
  getQuickReplies,
  upsertQuickReply,
  deleteQuickReply,
  type QuickReply,
} from "@/services/db/quickReplies";

export function QuickReplyEditor() {
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [shortcut, setShortcut] = useState("");

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    const qrs = await getQuickReplies(activeAccountId);
    setQuickReplies(qrs);
  }, [activeAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setShowForm(false);
    setTitle("");
    setBodyHtml("");
    setShortcut("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !title.trim()) return;
    await upsertQuickReply({
      id: editingId ?? undefined,
      accountId: activeAccountId,
      title: title.trim(),
      bodyHtml,
      shortcut: shortcut.trim() || null,
      sortOrder: editingId
        ? quickReplies.find((q) => q.id === editingId)?.sort_order ?? 0
        : quickReplies.length,
    });
    resetForm();
    await load();
  }, [activeAccountId, editingId, title, bodyHtml, shortcut, quickReplies, resetForm, load]);

  const handleEdit = useCallback((qr: QuickReply) => {
    setEditingId(qr.id);
    setShowForm(true);
    setTitle(qr.title);
    setBodyHtml(qr.body_html);
    setShortcut(qr.shortcut ?? "");
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteQuickReply(id);
    if (editingId === id) resetForm();
    await load();
  }, [editingId, resetForm, load]);

  const moveItem = useCallback(async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= quickReplies.length) return;
    const items = [...quickReplies];
    const a = items[index]!;
    const b = items[target]!;
    const tempOrder = a.sort_order;
    items[index] = { ...a, sort_order: b.sort_order };
    items[target] = { ...b, sort_order: tempOrder };
    setQuickReplies(items);
    await upsertQuickReply({
      id: a.id,
      accountId: a.account_id,
      title: a.title,
      bodyHtml: a.body_html,
      shortcut: a.shortcut,
      sortOrder: b.sort_order,
    });
    await upsertQuickReply({
      id: b.id,
      accountId: b.account_id,
      title: b.title,
      bodyHtml: b.body_html,
      shortcut: b.shortcut,
      sortOrder: a.sort_order,
    });
  }, [quickReplies]);

  return (
    <div className="space-y-3">
      {quickReplies.map((qr, idx) => (
        <div
          key={qr.id}
          className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary flex items-center gap-2">
              <Zap size={13} className="text-accent" />
              {qr.title}
              {qr.shortcut && (
                <kbd className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded border border-border-primary font-mono">
                  {qr.shortcut}
                </kbd>
              )}
            </div>
            <div className="text-xs text-text-tertiary truncate mt-0.5">
              Used {qr.usage_count} times
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
              disabled={idx === quickReplies.length - 1}
              className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronDown size={13} />
            </button>
            <button
              onClick={() => handleEdit(qr)}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => handleDelete(qr.id)}
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Quick reply title"
          />
          <div>
            <label className="text-xs text-text-secondary block mb-1">{t("quickReply.body")}</label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="<p>Your quick reply HTML here...</p>"
              rows={4}
              className="w-full bg-bg-tertiary text-text-primary text-xs px-3 py-2 rounded border border-border-primary outline-none focus:border-accent resize-y font-mono"
            />
          </div>
          <TextField
            type="text"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder={t("quickReply.shortcut") + " (e.g. #thanks)"}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!title.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? "Update" : t("common.save")}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
        >
          <Plus size={13} />
          Add quick reply
        </button>
      )}
    </div>
  );
}
