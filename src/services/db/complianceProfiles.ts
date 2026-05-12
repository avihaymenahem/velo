import { queryWithRetry, selectFirstBy, buildDynamicUpdate } from "./connection";
import type { ComplianceProfile, ComplianceRule } from "@/services/compliance/types";

function mapRow(row: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  region_hint: string | null;
  rules_json: string;
  is_active: number;
  is_default: number;
  created_at: number;
}): ComplianceProfile {
  let rules: ComplianceRule[] = [];
  try {
    rules = JSON.parse(row.rules_json) as ComplianceRule[];
  } catch {
    rules = [];
  }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    regionHint: row.region_hint,
    rules,
    isActive: row.is_active === 1,
    isDefault: row.is_default === 1,
  };
}

export async function getActiveProfiles(): Promise<ComplianceProfile[]> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{
      id: string; code: string; name: string; description: string | null;
      region_hint: string | null; rules_json: string;
      is_active: number; is_default: number; created_at: number;
    }[]>(
      "SELECT * FROM compliance_profiles WHERE is_active = 1 ORDER BY is_default DESC, name",
    );
    return rows.map(mapRow);
  });
}

export async function getProfilesForDomains(domains: string[]): Promise<ComplianceProfile[]> {
  if (domains.length === 0) return [];
  return queryWithRetry(async (db) => {
    const allProfiles = await db.select<{
      id: string; code: string; name: string; description: string | null;
      region_hint: string | null; rules_json: string;
      is_active: number; is_default: number; created_at: number;
    }[]>(
      "SELECT * FROM compliance_profiles WHERE is_active = 1",
    );
    return allProfiles.filter((row) => {
      if (!row.region_hint) return true;
      const hints = row.region_hint.split(",").map((h) => h.trim().toLowerCase());
      return domains.some((d) => hints.some((h) => d.endsWith(h)));
    }).map(mapRow);
  });
}

export async function getAllProfiles(): Promise<ComplianceProfile[]> {
  return queryWithRetry(async (db) => {
    const rows = await db.select<{
      id: string; code: string; name: string; description: string | null;
      region_hint: string | null; rules_json: string;
      is_active: number; is_default: number; created_at: number;
    }[]>("SELECT * FROM compliance_profiles ORDER BY is_default DESC, name");
    return rows.map(mapRow);
  });
}

export async function upsertProfile(profile: ComplianceProfile): Promise<void> {
  const encRules = JSON.stringify(profile.rules);
  const existing = await selectFirstBy<{ id: string }>(
    "SELECT id FROM compliance_profiles WHERE code = $1",
    [profile.code],
  );
  if (existing) {
    const fields: [string, unknown][] = [
      ["name", profile.name],
      ["description", profile.description],
      ["region_hint", profile.regionHint],
      ["rules_json", encRules],
      ["is_active", profile.isActive ? 1 : 0],
      ["is_default", profile.isDefault ? 1 : 0],
    ];
    await queryWithRetry(async (db) => {
      const query = buildDynamicUpdate("compliance_profiles", "id", existing.id, fields);
      if (query) {
        await db.execute(query.sql, query.params);
      }
    });
  } else {
    await queryWithRetry(async (db) => {
      await db.execute(
        "INSERT INTO compliance_profiles (id, code, name, description, region_hint, rules_json, is_active, is_default) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [profile.id, profile.code, profile.name, profile.description, profile.regionHint, encRules, profile.isActive ? 1 : 0, profile.isDefault ? 1 : 0],
      );
    });
  }
}

export async function setProfileActive(id: string, active: boolean): Promise<void> {
  return queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE compliance_profiles SET is_active = $1 WHERE id = $2",
      [active ? 1 : 0, id],
    );
  });
}

export async function setDefaultProfile(id: string): Promise<void> {
  await queryWithRetry(async (db) => {
    await db.execute("UPDATE compliance_profiles SET is_default = 0 WHERE is_default = 1");
    await db.execute("UPDATE compliance_profiles SET is_default = 1 WHERE id = $1", [id]);
  });
}

export async function insertCheck(check: {
  accountId: string;
  emailDraftId?: string;
  campaignId?: string;
  profileIds: string;
  score: number;
  violationsJson: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO compliance_checks (id, account_id, email_draft_id, campaign_id, profile_ids, score, violations_json) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [id, check.accountId, check.emailDraftId ?? null, check.campaignId ?? null, check.profileIds, check.score, check.violationsJson],
    );
  });
  return id;
}
