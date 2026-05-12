import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Pencil, Trash2, Check, X, Tags, Users } from "lucide-react";
import {
  getAllContacts,
  updateContact,
  deleteContact,
  type DbContact,
} from "@/services/db/contacts";
import { GroupManager } from "@/components/contacts/GroupManager";
import { CsvImportWizard } from "@/components/contacts/CsvImportWizard";
import { ContactMergeDialog } from "@/components/contacts/ContactMergeDialog";
import { Modal } from "@/components/ui/Modal";
import { useContactStore } from "@/stores/contactStore";
import { useAccountStore } from "@/stores/accountStore";
import { findMergeCandidates, mergeContacts, type MergeCandidate } from "@/services/contacts/merge";

export function ContactEditor() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<DbContact[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [tab, setTab] = useState<"contacts" | "tags">("contacts");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<MergeCandidate[]>([]);
  const [merging, setMerging] = useState(false);
  const primaryAccountId = useAccountStore((s) =>
    s.accounts.find((a) => a.isActive)?.id ?? "",
  );
  const tags = useContactStore((s) => s.tags);
  const loadTags = useContactStore((s) => s.loadTags);

  const loadContacts = useCallback(async () => {
    const all = await getAllContacts();
    setContacts(all);
  }, []);

  useEffect(() => {
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadContacts is stable (no deps), run once on mount
  }, []);

  useEffect(() => {
    if (tab === "tags" && primaryAccountId) {
      loadTags(primaryAccountId);
    }
  }, [tab, primaryAccountId, loadTags]);

  const handleFindDuplicates = useCallback(async () => {
    const candidates = await findMergeCandidates();
    setMergeCandidates(candidates);
    if (candidates.length > 0) {
      setShowMergeDialog(true);
    }
  }, []);

  const handleMerge = useCallback(async (keepId: string, mergeId: string) => {
    setMerging(true);
    try {
      await mergeContacts(keepId, mergeId);
      setMergeCandidates((prev) => prev.filter((c) => c.mergeId !== mergeId));
      await loadContacts();
    } catch (err) {
      console.error("Failed to merge contacts:", err);
    } finally {
      setMerging(false);
    }
  }, [loadContacts]);

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
    <>
      <div className="space-y-3">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-border-primary pb-2">
        <button
          onClick={() => setTab("contacts")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
            tab === "contacts"
              ? "text-accent border-b-2 border-accent"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          <Users size={13} />
          Contacts
        </button>
        <button
          onClick={() => setTab("tags")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
            tab === "tags"
              ? "text-accent border-b-2 border-accent"
              : "text-text-tertiary hover:text-text-secondary"
          }`}
        >
          <Tags size={13} />
          Tags & Groups
        </button>
      </div>

      {tab === "contacts" ? (
        <>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full pl-8 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-text-tertiary py-2">
              {search ? "No matching contacts" : "No contacts yet"}
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
                        placeholder="Display name"
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
                          title="Edit name"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(contact.id)}
                          className="p-1 text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete contact"
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
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} total
          </p>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setShowCsvImport(true)}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hover transition-colors">
              {t('contact.importContacts')}
            </button>
            <button onClick={handleFindDuplicates}
              disabled={merging}
              className="px-3 py-1.5 text-xs font-medium border border-border-primary text-text-secondary rounded-md hover:bg-bg-hover transition-colors">
              {merging ? t('common.loading') : t('contact.mergeDuplicates')}
            </button>
          </div>
          <div>
            <GroupManager accountId={primaryAccountId} />
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">
              All Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.625rem] font-medium"
                  style={{
                    backgroundColor: `${tag.color ?? "var(--color-accent, #6366f1)"}20`,
                    color: tag.color ?? "var(--color-accent, #6366f1)",
                  }}
                >
                  {tag.name}
                  <span className="text-text-tertiary ml-0.5">
                    ({tag.contact_count})
                  </span>
                </span>
              ))}
              {tags.length === 0 && (
                <p className="text-xs text-text-tertiary">No tags created yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
      {showCsvImport && (
        <Modal isOpen={showCsvImport} onClose={() => setShowCsvImport(false)} title={t('contact.importContacts')}>
          <CsvImportWizard isOpen={true} onClose={() => { setShowCsvImport(false); loadTags(primaryAccountId); }} accountId={primaryAccountId} />
        </Modal>
      )}
      {showMergeDialog && (
        <ContactMergeDialog
          isOpen={true}
          onClose={() => setShowMergeDialog(false)}
          candidates={mergeCandidates}
          onMerge={handleMerge}
        />
      )}
    </>
  );
}
