import { create } from "zustand";

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
}

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  setAccounts: (accounts: Account[]) => void;
  setActiveAccount: (id: string) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  activeAccountId: null,

  setAccounts: (accounts) =>
    set({
      accounts,
      activeAccountId: accounts[0]?.id ?? null,
    }),

  setActiveAccount: (activeAccountId) => set({ activeAccountId }),

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
}));
