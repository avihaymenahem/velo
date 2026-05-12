import { create } from "zustand";
import {
  getSmartFolders,
  insertSmartFolder,
  updateSmartFolder as updateSmartFolderDb,
  deleteSmartFolder as deleteSmartFolderDb,
  type DbSmartFolder,
} from "@/services/db/smartFolders";
import { getSmartFolderUnreadCount } from "@/services/search/smartFolderQuery";

export interface SmartFolder {
  id: string;
  accountId: string | null;
  name: string;
  query: string;
  icon: string;
  color: string | null;
  isDefault: boolean;
  sortOrder: number;
}

function mapDbFolder(db: DbSmartFolder): SmartFolder {
  return {
    id: db.id,
    accountId: db.account_id,
    name: db.name,
    query: db.query,
    icon: db.icon,
    color: db.color,
    isDefault: db.is_default === 1,
    sortOrder: db.sort_order,
  };
}

interface SmartFolderState {
  folders: SmartFolder[];
  unreadCounts: Record<string, number>;
  isLoading: boolean;
  loadFolders: (accountId?: string) => Promise<void>;
  createFolder: (
    name: string,
    query: string,
    accountId?: string,
    icon?: string,
    color?: string,
  ) => Promise<string>;
  updateFolder: (
    id: string,
    updates: { name?: string; query?: string; icon?: string; color?: string },
  ) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  refreshUnreadCounts: (accountId: string) => Promise<void>;
}

export const useSmartFolderStore = create<SmartFolderState>((set, get) => ({
  folders: [],
  unreadCounts: {},
  isLoading: false,

  loadFolders: async (accountId?: string) => {
    set({ isLoading: true });
    try {
      const dbFolders = await getSmartFolders(accountId);
      set({ folders: dbFolders.map(mapDbFolder) });
    } catch (err) {
      console.error("Failed to load smart folders:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  createFolder: async (name, query, accountId?, icon?, color?) => {
    const id = await insertSmartFolder({ name, query, accountId, icon, color });
    const { folders } = get();
    set({
      folders: [
        ...folders,
        {
          id,
          accountId: accountId ?? null,
          name,
          query,
          icon: icon ?? "Search",
          color: color ?? null,
          isDefault: false,
          sortOrder: folders.length,
        },
      ],
    });
    return id;
  },

  updateFolder: async (id, updates) => {
    await updateSmartFolderDb(id, updates);
    const { folders } = get();
    set({
      folders: folders.map((f) =>
        f.id === id ? { ...f, ...updates } : f,
      ),
    });
  },

  deleteFolder: async (id) => {
    await deleteSmartFolderDb(id);
    const { folders, unreadCounts } = get();
    const newCounts = { ...unreadCounts };
    delete newCounts[id];
    set({
      folders: folders.filter((f) => f.id !== id),
      unreadCounts: newCounts,
    });
  },

  refreshUnreadCounts: async (accountId: string) => {
    const { folders } = get();
    const counts: Record<string, number> = {};

    try {
      for (const folder of folders) {
        try {
          const { sql, params } = getSmartFolderUnreadCount(
            folder.query,
            accountId,
          );
          const rows = await (async () => {
            const { queryWithRetry } = await import("@/services/db/connection");
            return queryWithRetry(async (db) => db.select<{ count: number }[]>(sql, params));
          })();
          counts[folder.id] = rows[0]?.count ?? 0;
        } catch {
          counts[folder.id] = 0;
        }
      }
      set({ unreadCounts: counts });
    } catch (err) {
      console.error("Failed to refresh smart folder unread counts:", err);
    }
  },
}));
