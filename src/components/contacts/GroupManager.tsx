import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { useContactStore, type ContactGroup } from "@/stores/contactStore";
import { InputDialog } from "@/components/ui/InputDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface GroupManagerProps {
  accountId: string;
}

export function GroupManager({ accountId }: GroupManagerProps) {
  const groups = useContactStore((s) => s.groups);
  const isLoading = useContactStore((s) => s.isLoading);
  const loadGroups = useContactStore((s) => s.loadGroups);
  const createGroup = useContactStore((s) => s.createGroup);
  const deleteGroup = useContactStore((s) => s.deleteGroup);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContactGroup | null>(null);

  useEffect(() => {
    loadGroups(accountId);
  }, [accountId, loadGroups]);

  const handleCreate = useCallback(
    async (values: Record<string, string>) => {
      const name = values.name!;
      const desc = values.description;
      if (desc) {
        await createGroup(accountId, name, desc);
      } else {
        await createGroup(accountId, name);
      }
    },
    [accountId, createGroup],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteGroup(deleteTarget.id, accountId);
    setDeleteTarget(null);
  }, [deleteTarget, accountId, deleteGroup]);

  if (isLoading && groups.length === 0) {
    return (
      <div className="text-xs text-text-tertiary py-2">Loading groups...</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          Groups
        </h4>
        <button
          onClick={() => setShowCreate(true)}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          title="Create group"
        >
          <Plus size={14} />
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-text-tertiary">No groups yet</p>
      ) : (
        <div className="space-y-1">
          {groups.map((group) => (
            <div
              key={group.id}
              className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-hover group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users size={12} className="text-text-tertiary shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs text-text-primary truncate">
                    {group.name}
                  </div>
                  {group.description && (
                    <div className="text-[0.625rem] text-text-tertiary truncate">
                      {group.description}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[0.625rem] text-text-tertiary">
                  {group.contact_count}
                </span>
                <button
                  onClick={() => setDeleteTarget(group)}
                  className="p-0.5 text-text-tertiary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete group"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <InputDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        title="Create Group"
        fields={[
          { key: "name", label: "Name", placeholder: "Group name", required: true },
          { key: "description", label: "Description", placeholder: "Optional description", required: false },
        ]}
        submitLabel="Create"
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Group"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
