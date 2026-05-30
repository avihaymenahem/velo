import { create } from "zustand";
import { getAllContacts } from "@/services/db/contacts";

interface ContactsState {
  contactsMap: Record<string, string>;
  loadContacts: () => Promise<void>;
  updateContactInCache: (email: string, displayName: string | null) => void;
}

export const useContactsStore = create<ContactsState>((set) => ({
  contactsMap: {},

  loadContacts: async () => {
    const contacts = await getAllContacts();
    const map: Record<string, string> = {};
    for (const c of contacts) {
      if (c.display_name) {
        map[c.email.toLowerCase()] = c.display_name;
      }
    }
    set({ contactsMap: map });
  },

  updateContactInCache: (email, displayName) =>
    set((state) => {
      const key = email.toLowerCase();
      if (!displayName) {
        const next = { ...state.contactsMap };
        delete next[key];
        return { contactsMap: next };
      }
      return { contactsMap: { ...state.contactsMap, [key]: displayName } };
    }),
}));
