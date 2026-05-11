import { create } from "zustand";
import { getContactTags, upsertContactTag, deleteContactTag, getContactCountForTag, type DbContactTag } from "@/services/db/contactTags";
import { getContactGroups, upsertContactGroup, deleteContactGroup, getContactCountForGroup, type DbContactGroup } from "@/services/db/contactGroups";
import { getContactSegments, upsertContactSegment, deleteContactSegment, type DbContactSegment } from "@/services/db/contactSegments";

export interface ContactTag {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  contact_count: number;
}

export interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  contact_count: number;
}

export interface ContactSegment {
  id: string;
  name: string;
  query: string;
}

function mapTag(db: DbContactTag, count: number): ContactTag {
  return {
    id: db.id,
    name: db.name,
    color: db.color,
    sort_order: db.sort_order,
    contact_count: count,
  };
}

function mapGroup(db: DbContactGroup, count: number): ContactGroup {
  return {
    id: db.id,
    name: db.name,
    description: db.description,
    contact_count: count,
  };
}

function mapSegment(db: DbContactSegment): ContactSegment {
  return {
    id: db.id,
    name: db.name,
    query: db.query,
  };
}

interface ContactState {
  tags: ContactTag[];
  groups: ContactGroup[];
  segments: ContactSegment[];
  isLoading: boolean;
  loadTags: (accountId: string) => Promise<void>;
  loadGroups: (accountId: string) => Promise<void>;
  loadSegments: (accountId: string) => Promise<void>;
  createTag: (accountId: string, name: string, color?: string) => Promise<void>;
  createGroup: (accountId: string, name: string, description?: string) => Promise<void>;
  createSegment: (accountId: string, name: string, query: string) => Promise<void>;
  deleteTag: (id: string, accountId: string) => Promise<void>;
  deleteGroup: (id: string, accountId: string) => Promise<void>;
  deleteSegment: (id: string, accountId: string) => Promise<void>;
}

export const useContactStore = create<ContactState>((set, get) => ({
  tags: [],
  groups: [],
  segments: [],
  isLoading: false,

  loadTags: async (accountId: string) => {
    set({ isLoading: true });
    try {
      const dbTags = await getContactTags(accountId);
      const tags = await Promise.all(
        dbTags.map(async (t) => {
          const count = await getContactCountForTag(t.id);
          return mapTag(t, count);
        }),
      );
      set({ tags, isLoading: false });
    } catch (err) {
      console.error("Failed to load contact tags:", err);
      set({ isLoading: false });
    }
  },

  loadGroups: async (accountId: string) => {
    set({ isLoading: true });
    try {
      const dbGroups = await getContactGroups(accountId);
      const groups = await Promise.all(
        dbGroups.map(async (g) => {
          const count = await getContactCountForGroup(g.id);
          return mapGroup(g, count);
        }),
      );
      set({ groups, isLoading: false });
    } catch (err) {
      console.error("Failed to load contact groups:", err);
      set({ isLoading: false });
    }
  },

  loadSegments: async (accountId: string) => {
    set({ isLoading: true });
    try {
      const dbSegments = await getContactSegments(accountId);
      set({ segments: dbSegments.map(mapSegment), isLoading: false });
    } catch (err) {
      console.error("Failed to load contact segments:", err);
      set({ isLoading: false });
    }
  },

  createTag: async (accountId: string, name: string, color?: string) => {
    try {
      await upsertContactTag(undefined, accountId, name, color);
      await get().loadTags(accountId);
    } catch (err) {
      console.error("Failed to create contact tag:", err);
    }
  },

  createGroup: async (accountId: string, name: string, description?: string) => {
    try {
      await upsertContactGroup(undefined, accountId, name, description);
      await get().loadGroups(accountId);
    } catch (err) {
      console.error("Failed to create contact group:", err);
    }
  },

  createSegment: async (accountId: string, name: string, query: string) => {
    try {
      await upsertContactSegment(undefined, accountId, name, query);
      await get().loadSegments(accountId);
    } catch (err) {
      console.error("Failed to create contact segment:", err);
    }
  },

  deleteTag: async (id: string, accountId: string) => {
    try {
      await deleteContactTag(id, accountId);
      await get().loadTags(accountId);
    } catch (err) {
      console.error("Failed to delete contact tag:", err);
    }
  },

  deleteGroup: async (id: string, accountId: string) => {
    try {
      await deleteContactGroup(id, accountId);
      await get().loadGroups(accountId);
    } catch (err) {
      console.error("Failed to delete contact group:", err);
    }
  },

  deleteSegment: async (id: string, accountId: string) => {
    try {
      await deleteContactSegment(id, accountId);
      await get().loadSegments(accountId);
    } catch (err) {
      console.error("Failed to delete contact segment:", err);
    }
  },
}));
