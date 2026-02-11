/**
 * Application-level AES-GCM encryption using a device-derived key.
 * Key is randomly generated on first launch and stored in a separate file
 * via Tauri's filesystem in the app data directory.
 */

import { exists, readTextFile, writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";

const KEY_FILE_NAME = "velo.key";
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

let cachedKey: CryptoKey | null = null;

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getKeyFilePath(): Promise<string> {
  const dir = await appDataDir();
  return `${dir}${KEY_FILE_NAME}`;
}

async function ensureAppDataDir(): Promise<void> {
  const dir = await appDataDir();
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
}

// Web Crypto API accepts BufferSource (ArrayBuffer | ArrayBufferView).
// TypeScript's ES2021 lib types are strict about Uint8Array<ArrayBufferLike> vs ArrayBufferView<ArrayBuffer>.
// This cast satisfies the type checker while passing the Uint8Array directly to the API.
function asBufferSource(arr: Uint8Array): BufferSource {
  return arr as unknown as BufferSource;
}

async function getOrCreateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const keyPath = await getKeyFilePath();

  let rawKeyB64: string;
  if (await exists(keyPath)) {
    rawKeyB64 = (await readTextFile(keyPath)).trim();
  } else {
    // Generate a new random key
    const rawKey = new Uint8Array(KEY_LENGTH / 8);
    crypto.getRandomValues(rawKey);
    rawKeyB64 = base64Encode(rawKey);

    await ensureAppDataDir();
    await writeTextFile(keyPath, rawKeyB64);
  }

  const rawKey = base64Decode(rawKeyB64);
  cachedKey = await crypto.subtle.importKey(
    "raw",
    asBufferSource(rawKey),
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"],
  );

  return cachedKey;
}

/**
 * Encrypt a plaintext string. Returns a base64 string in the format: iv:ciphertext
 * (GCM tag is appended to ciphertext by the Web Crypto API)
 */
export async function encryptValue(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: asBufferSource(iv) },
    key,
    asBufferSource(data),
  );

  const ivB64 = base64Encode(iv);
  const ciphertextB64 = base64Encode(new Uint8Array(encrypted));
  return `${ivB64}:${ciphertextB64}`;
}

/**
 * Decrypt a value produced by encryptValue. Returns the original plaintext.
 */
export async function decryptValue(encrypted: string): Promise<string> {
  const key = await getOrCreateKey();

  const parts = encrypted.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted value format");
  }
  const [ivB64, ciphertextB64] = parts;
  if (!ivB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted value format");
  }

  const iv = base64Decode(ivB64);
  const ciphertext = base64Decode(ciphertextB64);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: asBufferSource(iv) },
    key,
    asBufferSource(ciphertext),
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Check if a value looks like it's already encrypted (base64:base64 format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 2) return false;
  try {
    atob(parts[0]!);
    atob(parts[1]!);
    // Encrypted values have a 12-byte IV (16 chars base64) and substantial ciphertext
    return parts[0]!.length === 16;
  } catch {
    return false;
  }
}
