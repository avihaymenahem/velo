import { useState, useEffect, useMemo } from "react";
import { Search, CheckSquare, Square, Users } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string;
}

interface CampaignRecipientPickerProps {
  accountId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function CampaignRecipientPicker({ accountId, selectedIds, onChange }: CampaignRecipientPickerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { queryWithRetry } = await import("@/services/db/connection");
        const rows = await queryWithRetry(async (db) =>
          db.select<Contact[]>(
            "SELECT id, name, email FROM contacts WHERE account_id = $1 ORDER BY name ASC",
            [accountId],
          ),
        );
        if (!cancelled) setContacts(rows);
      } catch (err) {
        console.error("Failed to load contacts:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [accountId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [contacts, search]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id));

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id],
    );
  }

  function toggleAll() {
    if (allSelected) {
      onChange(selectedIds.filter((s) => !filtered.some((c) => c.id === s)));
    } else {
      const newIds = new Set(selectedIds);
      for (const c of filtered) newIds.add(c.id);
      onChange([...newIds]);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary rounded-lg border border-border-primary">
        <Search size={14} className="text-text-tertiary shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-tertiary"
        />
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-text-tertiary flex items-center gap-1">
          <Users size={12} />
          {selectedIds.length} selected
        </span>
        <button
          onClick={toggleAll}
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          {allSelected ? <Square size={12} /> : <CheckSquare size={12} />}
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto space-y-0.5">
        {loading ? (
          <p className="text-xs text-text-tertiary px-1 py-2">Loading contacts...</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-text-tertiary px-1 py-2">
            {search ? "No matching contacts" : "No contacts yet"}
          </p>
        ) : (
          filtered.map((c) => {
            const isSelected = selectedIds.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-sm hover:bg-bg-hover transition-colors"
              >
                {isSelected ? (
                  <CheckSquare size={14} className="text-accent shrink-0" />
                ) : (
                  <Square size={14} className="text-text-tertiary shrink-0" />
                )}
                <span className="text-text-primary truncate">{c.name}</span>
                <span className="text-text-tertiary text-xs truncate">{c.email}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
