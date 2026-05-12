import { invoke } from "@tauri-apps/api/core";
import { getPgpKeys } from "@/services/db/pgpKeys";

export interface PgpKeyInfo {
  key_id: string;
  fingerprint: string;
  creation_time: string;
}

export async function generatePgpKey(
  userId: string,
  passphrase: string,
): Promise<[string, string]> {
  return invoke("generate_key", { userId, passphrase });
}

export async function getPgpKeyInfo(armoredKey: string): Promise<PgpKeyInfo> {
  return invoke("get_key_info_cmd", { armoredKey });
}

export async function encryptMessage(
  plaintext: string,
  publicKeyArmored: string,
): Promise<string> {
  return invoke("encrypt", { plaintext, publicKeyArmored });
}

export async function decryptMessage(
  ciphertextB64: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<string> {
  try {
    return await invoke<string>("pgp_decrypt_message", {
      ciphertextB64,
      privateKeyArmored,
      passphrase,
    });
  } catch (error) {
    throw new Error(
      `Failed to decrypt message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const passphraseCache = new Map<string, { passphrase: string; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export function cachePassphrase(accountId: string, passphrase: string): void {
  passphraseCache.set(accountId, {
    passphrase,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function getCachedPassphrase(accountId: string): string | null {
  const entry = passphraseCache.get(accountId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    passphraseCache.delete(accountId);
    return null;
  }
  return entry.passphrase;
}

export function clearCachedPassphrase(accountId: string): void {
  passphraseCache.delete(accountId);
}

export async function getPrivateKeyArmored(
  accountId: string,
): Promise<string | null> {
  const keys = await getPgpKeys(accountId);
  const key = keys[0];
  if (!key?.private_key_encrypted) return null;
  return key.private_key_encrypted;
}

export function isPgpMessage(text: string): boolean {
  return text.includes("-----BEGIN PGP MESSAGE-----");
}

export function extractPgpCiphertext(text: string): string | null {
  const start = text.indexOf("-----BEGIN PGP MESSAGE-----");
  if (start === -1) return null;
  const end = text.indexOf("-----END PGP MESSAGE-----", start);
  if (end === -1) return null;
  return text.slice(start, end + "-----END PGP MESSAGE-----".length);
}
