import { invoke } from "@tauri-apps/api/core";

export async function cachePassphrase(
  accountId: string,
  passphrase: string,
): Promise<void> {
  await invoke("pgp_cache_passphrase", { accountId, passphrase });
}

export async function getCachedPassphrase(
  accountId: string,
): Promise<string | null> {
  return invoke<string | null>("pgp_get_cached_passphrase", { accountId });
}

export async function clearPassphraseCache(accountId: string): Promise<void> {
  await invoke("pgp_clear_passphrase_cache", { accountId });
}
