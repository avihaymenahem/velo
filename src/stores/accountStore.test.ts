import { describe, it, expect, beforeEach } from "vitest";
import { useAccountStore, ALL_ACCOUNTS_ID, type Account } from "./accountStore";

const mockAccount: Account = {
  id: "acc-1",
  email: "test@gmail.com",
  displayName: "Test User",
  avatarUrl: null,
  isActive: true,
};

const mockAccount2: Account = {
  id: "acc-2",
  email: "work@gmail.com",
  displayName: "Work Account",
  avatarUrl: null,
  isActive: true,
};

describe("accountStore", () => {
  beforeEach(() => {
    useAccountStore.setState({
      accounts: [],
      activeAccountId: null,
      defaultAccountId: null,
    });
  });

  it("should start with no accounts", () => {
    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(0);
    expect(state.activeAccountId).toBeNull();
  });

  it("should add an account and set it as active", () => {
    useAccountStore.getState().addAccount(mockAccount);
    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(1);
    expect(state.activeAccountId).toBe("acc-1");
  });

  it("should not override active account when adding second account", () => {
    useAccountStore.getState().addAccount(mockAccount);
    useAccountStore.getState().addAccount(mockAccount2);
    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(2);
    expect(state.activeAccountId).toBe("acc-1");
  });

  it("should switch active account", () => {
    useAccountStore.getState().addAccount(mockAccount);
    useAccountStore.getState().addAccount(mockAccount2);
    useAccountStore.getState().setActiveAccount("acc-2");
    expect(useAccountStore.getState().activeAccountId).toBe("acc-2");
  });

  it("should remove account and update active if needed", () => {
    useAccountStore.getState().addAccount(mockAccount);
    useAccountStore.getState().addAccount(mockAccount2);
    useAccountStore.getState().removeAccount("acc-1");

    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(1);
    expect(state.activeAccountId).toBe("acc-2");
  });

  it("should set active to null when last account removed", () => {
    useAccountStore.getState().addAccount(mockAccount);
    useAccountStore.getState().removeAccount("acc-1");

    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(0);
    expect(state.activeAccountId).toBeNull();
  });

  it("should set accounts from array", () => {
    useAccountStore.getState().setAccounts([mockAccount, mockAccount2]);
    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(2);
    expect(state.activeAccountId).toBe("acc-1");
  });

  describe("defaultAccountId", () => {
    it("should default to first account on setAccounts", () => {
      useAccountStore.getState().setAccounts([mockAccount, mockAccount2]);
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-1");
    });

    it("should restore persisted defaultAccountId", () => {
      useAccountStore.getState().setAccounts([mockAccount, mockAccount2], null, "acc-2");
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-2");
    });

    it("should fall back to first account if persisted default is invalid", () => {
      useAccountStore.getState().setAccounts([mockAccount, mockAccount2], null, "nonexistent");
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-1");
    });

    it("should set defaultAccountId on addAccount when null", () => {
      useAccountStore.getState().addAccount(mockAccount);
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-1");
    });

    it("should not override defaultAccountId when adding second account", () => {
      useAccountStore.getState().addAccount(mockAccount);
      useAccountStore.getState().addAccount(mockAccount2);
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-1");
    });

    it("should update defaultAccountId when default account is removed", () => {
      useAccountStore.getState().addAccount(mockAccount);
      useAccountStore.getState().addAccount(mockAccount2);
      useAccountStore.getState().setDefaultAccount("acc-1");
      useAccountStore.getState().removeAccount("acc-1");
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-2");
    });

    it("should allow switching default account", () => {
      useAccountStore.getState().addAccount(mockAccount);
      useAccountStore.getState().addAccount(mockAccount2);
      useAccountStore.getState().setDefaultAccount("acc-2");
      expect(useAccountStore.getState().defaultAccountId).toBe("acc-2");
    });
  });

  describe("ALL_ACCOUNTS_ID", () => {
    it("should export a sentinel value", () => {
      expect(ALL_ACCOUNTS_ID).toBe("__all__");
    });

    it("should allow setting activeAccountId to ALL_ACCOUNTS_ID", () => {
      useAccountStore.getState().addAccount(mockAccount);
      useAccountStore.getState().addAccount(mockAccount2);
      useAccountStore.getState().setActiveAccount(ALL_ACCOUNTS_ID);
      expect(useAccountStore.getState().activeAccountId).toBe(ALL_ACCOUNTS_ID);
    });

    it("should not include ALL_ACCOUNTS_ID in accounts array", () => {
      useAccountStore.getState().addAccount(mockAccount);
      useAccountStore.getState().setActiveAccount(ALL_ACCOUNTS_ID);
      const state = useAccountStore.getState();
      expect(state.accounts.find((a) => a.id === ALL_ACCOUNTS_ID)).toBeUndefined();
    });
  });
});
