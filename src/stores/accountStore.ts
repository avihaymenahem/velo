import { create } from "zustand";
import { setSetting } from "../services/db/settings";

/** Sentinel value for "All Accounts" unified inbox view */
export const ALL_ACCOUNTS_ID = "__all__";

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  provider?: string;
}

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  /** The account used for composing, signatures, templates, etc. Defaults to first account. */
  defaultAccountId: string | null;
  setAccounts: (accounts: Account[], restoredId?: string | null, restoredDefaultId?: string | null) => void;
  setActiveAccount: (id: string) => void;
  setDefaultAccount: (id: string) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
}

/** Returns all account IDs (useful for sync when ALL_ACCOUNTS_ID is active). */
export function getAllAccountIds(): string[] {
  return useAccountStore.getState().accounts.map((a) => a.id);
}

export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  activeAccountId: null,
  defaultAccountId: null,

  setAccounts: (accounts, restoredId, restoredDefaultId) => {
    const isValidId = restoredId && (
      restoredId === ALL_ACCOUNTS_ID
        ? accounts.length > 1
        : accounts.some((a) => a.id === restoredId)
    );
    const activeId = isValidId ? restoredId : accounts[0]?.id ?? null;

    const isValidDefault = restoredDefaultId && accounts.some((a) => a.id === restoredDefaultId);
    const defaultId = isValidDefault ? restoredDefaultId : accounts[0]?.id ?? null;

    set({ accounts, activeAccountId: activeId, defaultAccountId: defaultId });
  },

  setActiveAccount: (activeAccountId) => {
    setSetting("active_account_id", activeAccountId).catch(() => {});
    set({ activeAccountId });
  },

  setDefaultAccount: (defaultAccountId) => {
    setSetting("default_account_id", defaultAccountId).catch(() => {});
    set({ defaultAccountId });
  },

  addAccount: (account) =>
    set((state) => ({
      accounts: [...state.accounts, account],
      activeAccountId: state.activeAccountId ?? account.id,
      defaultAccountId: state.defaultAccountId ?? account.id,
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
        defaultAccountId:
          state.defaultAccountId === id
            ? (accounts[0]?.id ?? null)
            : state.defaultAccountId,
      };
    }),
}));
