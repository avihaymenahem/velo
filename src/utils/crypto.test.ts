import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockTauriFs } from "@/test/mocks";

const tauriFs = createMockTauriFs();

vi.mock("@tauri-apps/plugin-fs", () => tauriFs.mock);

describe("crypto", () => {
  beforeEach(() => {
    vi.resetModules();
    tauriFs.store.clear();
  });

  it("encrypts and decrypts a value roundtrip", async () => {
    const { encryptValue, decryptValue } = await import("./crypto");
    const plaintext = "my-secret-api-key-12345";
    const encrypted = await encryptValue(plaintext);

    expect(encrypted).not.toBe(plaintext);
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

  it("uses baseDir option for FS operations", async () => {
    const { encryptValue } = await import("./crypto");

    await encryptValue("test");

    expect(tauriFs.mock.exists).toHaveBeenCalledWith(
      "velo.key",
      expect.objectContaining({ baseDir: 26 }),
    );
    expect(tauriFs.mock.writeTextFile).toHaveBeenCalledWith(
      "velo.key",
      expect.any(String),
      expect.objectContaining({ baseDir: 26 }),
    );
  });

  it("reads existing key from file using baseDir", async () => {
    // Pre-seed a key in the mock store
    const mockKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(42)));
    tauriFs.store.set("velo.key", mockKey);

    const { encryptValue, decryptValue } = await import("./crypto");
    const encrypted = await encryptValue("round-trip-test");

    expect(tauriFs.mock.readTextFile).toHaveBeenCalledWith(
      "velo.key",
      expect.objectContaining({ baseDir: 26 }),
    );

    const decrypted = await decryptValue(encrypted);
    expect(decrypted).toBe("round-trip-test");
  });
});
