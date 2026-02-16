export function createMockUIStoreState(overrides: Record<string, unknown> = {}) {
  return {
    isOnline: true,
    setPendingOpsCount: vi.fn(),
    ...overrides,
  };
}

export function createMockThreadStoreState(
  overrides: Record<string, unknown> = {},
) {
  return {
    threads: [],
    updateThread: vi.fn(),
    removeThread: vi.fn(),
    removeThreads: vi.fn(),
    ...overrides,
  };
}

export function createMockAccountStoreState(
  overrides: Record<string, unknown> = {},
) {
  return {
    accounts: [],
    activeAccountId: null,
    ...overrides,
  };
}
