export interface AuthVerdict {
  result: string;
  detail: string | null;
}

export interface AuthResult {
  spf: AuthVerdict;
  dkim: AuthVerdict;
  dmarc: AuthVerdict;
  aggregate: "pass" | "warning" | "fail" | "unknown";
}

/**
 * Parse a single auth mechanism result from the Authentication-Results header value.
 * Matches patterns like: spf=pass (detail text)
 */
function parseVerdict(headerValue: string, mechanism: string): AuthVerdict | null {
  // Match mechanism=result, optionally followed by parenthetical details
  // Use case-insensitive matching and allow whitespace/newlines
  const normalized = headerValue.replace(/\r?\n\s*/g, " ");
  const regex = new RegExp(
    `${mechanism}\\s*=\\s*(\\w+)(?:\\s*\\(([^)]+)\\))?`,
    "i",
  );
  const match = normalized.match(regex);
  if (!match) return null;
  return {
    result: match[1]!.toLowerCase(),
    detail: match[2]?.trim() ?? null,
  };
}

/**
 * Parse SPF result from Received-SPF header as a fallback.
 * Format: "pass (detail text) ..." or just "pass ..."
 */
function parseReceivedSpf(headerValue: string): AuthVerdict | null {
  const normalized = headerValue.replace(/\r?\n\s*/g, " ").trim();
  const match = normalized.match(/^(\w+)(?:\s*\(([^)]+)\))?/i);
  if (!match) return null;
  return {
    result: match[1]!.toLowerCase(),
    detail: match[2]?.trim() ?? null,
  };
}

function unknownVerdict(): AuthVerdict {
  return { result: "unknown", detail: null };
}

/**
 * Compute the aggregate verdict from individual results.
 *
 * - pass: DMARC passes, OR all three pass
 * - fail: DMARC fails, OR both SPF and DKIM fail
 * - warning: mixed results (some pass, some don't)
 * - unknown: no meaningful data
 */
function computeAggregate(
  spf: AuthVerdict,
  dkim: AuthVerdict,
  dmarc: AuthVerdict,
): "pass" | "warning" | "fail" | "unknown" {
  const dmarcResult = dmarc.result;
  const spfResult = spf.result;
  const dkimResult = dkim.result;

  // If DMARC passes, aggregate is pass
  if (dmarcResult === "pass") return "pass";

  // If DMARC explicitly fails, aggregate is fail
  if (dmarcResult === "fail") return "fail";

  // If both SPF and DKIM fail, aggregate is fail
  const spfFailed = spfResult === "fail" || spfResult === "hardfail";
  const dkimFailed = dkimResult === "fail" || dkimResult === "hardfail";
  if (spfFailed && dkimFailed) return "fail";

  // If all are unknown, aggregate is unknown
  if (
    spfResult === "unknown" &&
    dkimResult === "unknown" &&
    dmarcResult === "unknown"
  ) {
    return "unknown";
  }

  // If all known results pass
  const spfPassed = spfResult === "pass";
  const dkimPassed = dkimResult === "pass";
  const dmarcUnknown = dmarcResult === "unknown";

  if (spfPassed && dkimPassed && dmarcUnknown) return "pass";

  // Mixed results
  return "warning";
}

/**
 * Parse email authentication results from message headers.
 *
 * Tries these headers in order:
 * 1. Authentication-Results
 * 2. ARC-Authentication-Results
 * 3. Received-SPF (SPF only fallback)
 *
 * Returns null if no authentication headers are found at all.
 */
export function parseAuthenticationResults(
  headers: { name: string; value: string }[],
): AuthResult | null {
  // Try Authentication-Results first
  const authResultsHeader = headers.find(
    (h) => h.name.toLowerCase() === "authentication-results",
  );

  // Fallback to ARC-Authentication-Results
  const arcHeader =
    authResultsHeader ??
    headers.find(
      (h) => h.name.toLowerCase() === "arc-authentication-results",
    );

  // Fallback to Received-SPF for SPF only
  const receivedSpfHeader = headers.find(
    (h) => h.name.toLowerCase() === "received-spf",
  );

  // No auth headers at all
  if (!arcHeader && !receivedSpfHeader) return null;

  let spf: AuthVerdict = unknownVerdict();
  let dkim: AuthVerdict = unknownVerdict();
  let dmarc: AuthVerdict = unknownVerdict();

  if (arcHeader) {
    const headerValue = arcHeader.value;

    spf = parseVerdict(headerValue, "spf") ?? unknownVerdict();

    // For DKIM, there might be multiple results. If any passes, consider it a pass.
    const normalized = headerValue.replace(/\r?\n\s*/g, " ");
    const dkimMatches = [...normalized.matchAll(/dkim\s*=\s*(\w+)(?:\s*\(([^)]+)\))?/gi)];
    if (dkimMatches.length > 0) {
      const hasPass = dkimMatches.some((m) => m[1]!.toLowerCase() === "pass");
      if (hasPass) {
        const passMatch = dkimMatches.find((m) => m[1]!.toLowerCase() === "pass");
        dkim = {
          result: "pass",
          detail: passMatch?.[2]?.trim() ?? null,
        };
      } else {
        // Use the first result
        dkim = {
          result: dkimMatches[0]![1]!.toLowerCase(),
          detail: dkimMatches[0]![2]?.trim() ?? null,
        };
      }
    }

    dmarc = parseVerdict(headerValue, "dmarc") ?? unknownVerdict();
  } else if (receivedSpfHeader) {
    // Only SPF info available
    spf = parseReceivedSpf(receivedSpfHeader.value) ?? unknownVerdict();
  }

  const aggregate = computeAggregate(spf, dkim, dmarc);

  return { spf, dkim, dmarc, aggregate };
}
