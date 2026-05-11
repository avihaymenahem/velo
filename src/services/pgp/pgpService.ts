import { invoke } from "@tauri-apps/api/core";

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
