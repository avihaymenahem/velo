import { vi } from "vitest";

/**
 * Creates a mock for @tauri-apps/plugin-fs that simulates file operations
 * using an in-memory Map store. All operations use baseDir option (not absolute paths).
 */
export function createMockTauriFs() {
  const store = new Map<string, string>();

  return {
    store,
    mock: {
      exists: vi.fn(async (path: string) => store.has(path)),
      readTextFile: vi.fn(async (path: string) => store.get(path) ?? ""),
      writeTextFile: vi.fn(async (path: string, content: string) => {
        store.set(path, content);
      }),
      writeFile: vi.fn(),
      readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
      mkdir: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      BaseDirectory: { AppData: 26 },
    },
  };
}

/**
 * Creates a mock for @tauri-apps/api/path with simple join behavior.
 */
export function createMockTauriPath() {
  return {
    join: vi.fn(async (...parts: string[]) => parts.join("/")),
    appDataDir: vi.fn(async () => "/mock/app/data/"),
  };
}
