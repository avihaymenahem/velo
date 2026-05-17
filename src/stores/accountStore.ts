import { create } from "zustand";
import { setSetting } from "../services/db/settings";
import { updateAccountMeta } from "../services/db/accounts";

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  provider?: string;
  color: string | null;
  includeInGlobal: boolean;
  sortOrder: number;
  label: string | null;
}

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  setAccounts: (accounts: Account[], restoredId?: string | null) => void;
  /** Pass null to enter unified-inbox context (no single active account). */
  setActiveAccount: (id: string | null) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  reorderAccounts: (orderedIds: string[]) => Promise<void>;
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  activeAccountId: null,

  setAccounts: (accounts, restoredId) => {
    const activeId = (restoredId && accounts.some((a) => a.id === restoredId))
      ? restoredId
      : accounts[0]?.id ?? null;
    set({ accounts, activeAccountId: activeId });
  },

  setActiveAccount: (activeAccountId) => {
    if (activeAccountId !== null) {
      setSetting("active_account_id", activeAccountId).catch(() => {});
    }
    set({ activeAccountId });
  },

  addAccount: (account) =>
    set((state) => ({
      accounts: [...state.accounts, account],
      activeAccountId: state.activeAccountId ?? account.id,
    })),

  removeAccount: (id) =>
    set((state) => {
      const accounts = state.accounts.filter((a) => a.id !== id);
      return {
        accounts,
        activeAccountId:
          state.activeAccountId === id
            ? (accounts[0]?.id ?? null)
            : state.activeAccountId,
      };
    }),

  reorderAccounts: async (orderedIds) => {
    set((state) => {
      const idToIndex = new Map(orderedIds.map((id, i) => [id, i]));
      const accounts = [...state.accounts].sort((a, b) => {
        const ia = idToIndex.get(a.id) ?? state.accounts.indexOf(a);
        const ib = idToIndex.get(b.id) ?? state.accounts.indexOf(b);
        return ia - ib;
      });
      return { accounts: accounts.map((a, i) => ({ ...a, sortOrder: i })) };
    });
    await Promise.all(
      orderedIds.map((id, i) => updateAccountMeta(id, { sortOrder: i })),
    );
  },
}));
