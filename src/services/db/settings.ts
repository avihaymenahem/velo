import { getDb } from "./connection";
import { encryptValue, decryptValue, isEncrypted } from "@/utils/crypto";

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Get a setting that is stored encrypted. Transparently decrypts the value.
 * Falls back to returning the raw value if decryption fails (e.g. not yet encrypted).
 */
export async function getSecureSetting(key: string): Promise<string | null> {
  const raw = await getSetting(key);
  if (!raw) return null;

  if (isEncrypted(raw)) {
    try {
      return await decryptValue(raw);
    } catch {
      // If decryption fails, the value may be plaintext (pre-encryption migration)
      return raw;
    }
  }
  return raw;
}

/**
 * Set a setting with encryption. The value is encrypted before storing.
 */
export async function setSecureSetting(key: string, value: string): Promise<void> {
  const encrypted = await encryptValue(value);
  await setSetting(key, encrypted);
}
