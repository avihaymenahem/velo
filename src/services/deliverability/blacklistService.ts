import { getCachedCheck, cacheCheck, getBlacklistHistory as dbGetHistory } from "@/services/db/blacklistCache";
import type { BlacklistCheckRow } from "@/services/db/blacklistCache";
import { invoke } from "@tauri-apps/api/core";

export interface BlacklistCheckResult {
  listName: string;
  listed: boolean;
  responded: boolean;
}

const DNSBLS = [
  { name: "Spamhaus", host: "zen.spamhaus.org" },
  { name: "Barracuda", host: "b.barracudacentral.org" },
  { name: "SpamCop", host: "bl.spamcop.net" },
  { name: "SURBL", host: "multi.surbl.org" },
];

export async function checkBlacklists(accountId: string, target: string, checkType: "ip" | "domain"): Promise<BlacklistCheckResult[]> {
  const cached = await getCachedCheck(accountId, checkType, target);
  if (cached && cached.listed === 1) {
    return [{
      listName: cached.list_name ?? "unknown",
      listed: true,
      responded: cached.responded === 1,
    }];
  }

  if (checkType !== "ip") {
    return DNSBLS.map((d) => ({ listName: d.name, listed: false, responded: false }));
  }

  let results: BlacklistCheckResult[];
  try {
    results = await invoke<BlacklistCheckResult[]>("check_dnsbl_cmd", { ip: target });
  } catch {
    results = DNSBLS.map((d) => ({ listName: d.name, listed: false, responded: false }));
  }

  for (const r of results) {
    await cacheCheck(accountId, checkType, target, r.listed, r.listName, r.responded);
  }

  return results;
}

export async function getBlacklistHistory(accountId: string): Promise<BlacklistCheckRow[]> {
  return dbGetHistory(accountId);
}
