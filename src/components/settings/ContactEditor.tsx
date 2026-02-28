import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Pencil, Trash2, Check, X } from "lucide-react";
import {
  getAllContacts,
  updateContact,
  deleteContact,
  type DbContact,
} from "@/services/db/contacts";

export function ContactEditor() {
  const { t } = useTranslation("settings");
  const [contacts, setContacts] = useState<DbContact[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadContacts = useCallback(async () => {
    const all = await getAllContacts();
    setContacts(all);
  }, []);

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadContacts is stable (no deps), run once on mount
  }, []);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.display_name?.toLowerCase().includes(q) ?? false),
    );
  }, [contacts, search]);

  const handleEdit = (contact: DbContact) => {
    setEditingId(contact.id);
    setEditName(contact.display_name ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await updateContact(editingId, editName || null);
    setEditingId(null);
    await loadContacts();
  };

  const handleDelete = async (id: string) => {
    await deleteContact(id);
    await loadContacts();
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("contactEditor.searchPlaceholder")}
          className="w-full pl-8 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-text-tertiary py-2">
          {search ? t("contactEditor.noMatching") : t("contactEditor.noContacts")}
        </p>
      ) : (
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-hover group"
            >
              {editingId === contact.id ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 min-w-0 px-2 py-0.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
                    autoFocus
                    placeholder={t("contactEditor.displayName")}
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="p-1 text-success hover:bg-bg-hover rounded"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary truncate">
                      {contact.display_name ?? contact.email}
                    </div>
                    {contact.display_name && (
                      <div className="text-xs text-text-tertiary truncate">
                        {contact.email}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-text-tertiary mr-2">
                      {contact.frequency}x
                    </span>
                    <button
                      onClick={() => handleEdit(contact)}
                      className="p-1 text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t("contactEditor.editName")}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(contact.id)}
                      className="p-1 text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      title={t("contactEditor.deleteContact")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-text-tertiary">
        {t("contactEditor.contact", { count: contacts.length })} {t("contactEditor.total")}
      </p>
    </div>
  );
}
