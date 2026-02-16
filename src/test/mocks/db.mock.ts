import { vi } from "vitest";

export function createMockDb() {
  return {
    select: vi.fn(() => Promise.resolve([])),
    execute: vi.fn(() => Promise.resolve({ rowsAffected: 1 })),
  };
}
