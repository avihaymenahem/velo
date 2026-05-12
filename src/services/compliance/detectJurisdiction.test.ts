import { describe, it, expect } from "vitest";
import { detectJurisdiction } from "./ruleEngine";
import type { ComplianceProfile, ComplianceCheckContext } from "./types";

function makeProfile(overrides: Partial<ComplianceProfile> = {}): ComplianceProfile {
  return {
    id: "p1", code: "C1", name: "Test", description: null,
    regionHint: null, isActive: true, isDefault: false,
    rules: [],
    ...overrides,
  };
}

describe("detectJurisdiction TLD mapping", () => {
  it("maps .fr to GDPR profile", () => {
    const gdpr = makeProfile({ id: "gdpr", code: "GDPR", regionHint: ".fr,.de,.es,.it" });
    const result = detectJurisdiction([{ email: "user@company.fr" }], [gdpr]);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("GDPR");
  });

  it("maps .br to LGPD profile", () => {
    const lgpd = makeProfile({ id: "lgpd", code: "LGPD", regionHint: ".br" });
    const result = detectJurisdiction([{ email: "user@company.com.br" }], [lgpd]);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("LGPD");
  });

  it("maps .ma to Morocco profile", () => {
    const morocco = makeProfile({ id: "ma", code: "MA", regionHint: ".ma" });
    const result = detectJurisdiction([{ email: "user@company.ma" }], [morocco]);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("MA");
  });

  it("returns multiple profiles for multiple recipients in different jurisdictions", () => {
    const gdpr = makeProfile({ id: "gdpr", code: "GDPR", regionHint: ".fr" });
    const morocco = makeProfile({ id: "ma", code: "MA", regionHint: ".ma" });
    const result = detectJurisdiction(
      [{ email: "a@company.fr" }, { email: "b@company.ma" }],
      [gdpr, morocco],
    );
    expect(result).toHaveLength(2);
    const codes = result.map((p) => p.code).sort();
    expect(codes).toEqual(["GDPR", "MA"]);
  });

  it("does not duplicate a profile when multiple recipients share jurisdiction", () => {
    const gdpr = makeProfile({ id: "gdpr", code: "GDPR", regionHint: ".fr" });
    const result = detectJurisdiction(
      [{ email: "a@company.fr" }, { email: "b@company.fr" }],
      [gdpr],
    );
    expect(result).toHaveLength(1);
  });
});

describe("detectJurisdiction edge cases", () => {
  it("returns empty when no profiles match", () => {
    const gdpr = makeProfile({ id: "gdpr", code: "GDPR", regionHint: ".fr" });
    const result = detectJurisdiction([{ email: "user@company.ma" }], [gdpr]);
    expect(result).toHaveLength(0);
  });

  it("returns profile with no regionHint for any recipient", () => {
    const fallback = makeProfile({ id: "default", code: "DEFAULT", regionHint: null });
    const result = detectJurisdiction([{ email: "user@company.ma" }], [fallback]);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("DEFAULT");
  });
});
