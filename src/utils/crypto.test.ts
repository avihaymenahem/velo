import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri FS and path modules before importing the module
vi.mock("@tauri-apps/plugin-fs", () => {
  const store = new Map<string, string>();
  return {
    exists: vi.fn(async (path: string) => store.has(path)),
    readTextFile: vi.fn(async (path: string) => store.get(path) ?? ""),
    writeTextFile: vi.fn(async (path: string, content: string) => { store.set(path, content); }),
    mkdir: vi.fn(async () => {}),
  };
});

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(async () => "/mock/app/data/"),
}));

describe("crypto", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("encrypts and decrypts a value roundtrip", async () => {
    const { encryptValue, decryptValue } = await import("./crypto");
    const plaintext = "my-secret-api-key-12345";
    const encrypted = await encryptValue(plaintext);

    // Encrypted value should be different from plaintext
    expect(encrypted).not.toBe(plaintext);
    // Should be in iv:ciphertext format
    expect(encrypted.split(":")).toHaveLength(2);

    const decrypted = await decryptValue(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const { encryptValue } = await import("./crypto");
    const plaintext = "same-value";
    const enc1 = await encryptValue(plaintext);
    const enc2 = await encryptValue(plaintext);
    expect(enc1).not.toBe(enc2);
  });

  it("decryptValue throws on invalid format", async () => {
    const { decryptValue } = await import("./crypto");
    await expect(decryptValue("not-valid")).rejects.toThrow("Invalid encrypted value format");
  });

  it("isEncrypted returns true for encrypted values", async () => {
    const { encryptValue, isEncrypted } = await import("./crypto");
    const encrypted = await encryptValue("test");
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("isEncrypted returns false for plaintext", async () => {
    const { isEncrypted } = await import("./crypto");
    expect(isEncrypted("sk-ant-1234567890abcdef")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("just-a-regular-string")).toBe(false);
  });

  it("handles empty string encryption", async () => {
    const { encryptValue, decryptValue } = await import("./crypto");
    const encrypted = await encryptValue("");
    const decrypted = await decryptValue(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode content", async () => {
    const { encryptValue, decryptValue } = await import("./crypto");
    const plaintext = "Hello World! Emoji test";
    const encrypted = await encryptValue(plaintext);
    const decrypted = await decryptValue(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
