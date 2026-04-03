/**
 * Phishing Link Heuristic Detection Engine
 *
 * Pure-function analysis of URLs for phishing indicators.
 * 10 heuristic rules, each returning a score and detail.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface TriggeredRule {
  ruleId: string;
  name: string;
  score: number;
  detail: string;
}

export interface LinkAnalysis {
  url: string;
  displayText: string;
  riskScore: number;
  riskLevel: "safe" | "low" | "medium" | "high";
  triggeredRules: TriggeredRule[];
}

export interface MessageScanResult {
  messageId: string;
  links: LinkAnalysis[];
  maxRiskScore: number;
  suspiciousLinkCount: number;
  showBanner: boolean;
  scannedAt: number;
}

// ── Constants ──────────────────────────────────────────────────────

const SUSPICIOUS_TLDS_TIER1 = new Set([
  ".zip", ".mov", ".top", ".click", ".buzz", ".tk", ".ml", ".ga", ".cf", ".gq",
]);
const SUSPICIOUS_TLDS_TIER2 = new Set([
  ".xyz", ".work", ".rest", ".surf", ".icu", ".cam", ".quest", ".sbs", ".cfd",
]);
const SUSPICIOUS_TLDS_TIER3 = new Set([
  ".info", ".online", ".site", ".club", ".space", ".fun", ".store", ".live",
]);

const URL_SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly",
]);

const SUSPICIOUS_PATH_KEYWORDS = [
  "login", "signin", "verify", "confirm", "suspend", "secure",
  "password", "credential", "wallet", "banking", "oauth", "token", "authenticate",
];

const DANGEROUS_PROTOCOLS = new Set(["data:", "javascript:", "vbscript:", "blob:"]);

const IMPERSONATED_BRANDS = [
  "paypal", "amazon", "apple", "microsoft", "google", "chase",
  "wellsfargo", "bankofamerica", "netflix", "facebook", "instagram", "dropbox",
];

const MAX_LINKS = 200;

// ── Risk Level ─────────────────────────────────────────────────────

export function getRiskLevel(score: number): "safe" | "low" | "medium" | "high" {
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score >= 20) return "low";
  return "safe";
}

// ── Individual Rule Functions ──────────────────────────────────────

function checkIpAddress(hostname: string): TriggeredRule | null {
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (ipv4.test(hostname) || hostname.startsWith("[")) {
    return {
      ruleId: "ip-address",
      name: "IP Address URL",
      score: 40,
      detail: `URL points to raw IP address: ${hostname}`,
    };
  }
  return null;
}

function checkHomograph(hostname: string): TriggeredRule | null {
  // Split hostname into labels and check each for xn-- prefix (Punycode)
  const labels = hostname.split(".");
  if (labels.some((label) => label.startsWith("xn--"))) {
    return {
      ruleId: "homograph",
      name: "Homograph/Punycode Domain",
      score: 50,
      detail: `Domain uses Punycode (internationalized characters): ${hostname}`,
    };
  }
  return null;
}

function checkSuspiciousTld(hostname: string): TriggeredRule | null {
  const lastDot = hostname.lastIndexOf(".");
  if (lastDot === -1) return null;
  const tld = hostname.slice(lastDot).toLowerCase();

  if (SUSPICIOUS_TLDS_TIER1.has(tld)) {
    return {
      ruleId: "suspicious-tld",
      name: "Suspicious TLD",
      score: 35,
      detail: `High-risk top-level domain: ${tld}`,
    };
  }
  if (SUSPICIOUS_TLDS_TIER2.has(tld)) {
    return {
      ruleId: "suspicious-tld",
      name: "Suspicious TLD",
      score: 20,
      detail: `Medium-risk top-level domain: ${tld}`,
    };
  }
  if (SUSPICIOUS_TLDS_TIER3.has(tld)) {
    return {
      ruleId: "suspicious-tld",
      name: "Suspicious TLD",
      score: 10,
      detail: `Low-risk top-level domain: ${tld}`,
    };
  }
  return null;
}

/**
 * Known multi-part TLD suffixes (country-code second-level domains).
 * Covers the most common ccSLDs to avoid false positives/negatives
 * in domain comparison (e.g., .co.uk, .co.jp, .com.au).
 */
const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "com.au", "net.au", "org.au", "edu.au",
  "co.kr", "or.kr", "go.kr",
  "com.br", "org.br", "net.br",
  "co.nz", "org.nz", "net.nz",
  "co.in", "org.in", "net.in",
  "com.cn", "org.cn", "net.cn",
  "co.za", "org.za", "net.za",
  "com.tw", "org.tw", "net.tw",
  "com.hk", "org.hk", "net.hk",
  "co.id", "or.id",
  "com.sg", "org.sg",
  "com.mx", "org.mx",
  "com.ar", "org.ar",
  "co.th", "or.th",
  "com.tr", "org.tr",
  "co.il",
  "com.pl", "org.pl", "net.pl",
  "com.ua", "org.ua",
  "co.de",
]);

/**
 * Extract the registrable domain (effective second-level domain + TLD).
 * Handles multi-part TLDs like .co.uk, .co.jp, etc.
 */
function getRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join(".");
    if (MULTI_PART_TLDS.has(lastTwo)) {
      // e.g., "sub.example.co.uk" → "example.co.uk"
      return parts.slice(-3).join(".");
    }
  }
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return hostname.toLowerCase();
}

function checkDisplayHrefMismatch(url: string, displayText: string): TriggeredRule | null {
  const trimmed = displayText.trim();
  if (!trimmed) return null;

  // Check if display text looks like a URL (contains :// or matches domain pattern)
  const looksLikeUrl = trimmed.includes("://") || /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/|$)/.test(trimmed);
  if (!looksLikeUrl) return null;

  // Extract domain from display text
  let displayDomain: string;
  try {
    // Try parsing with protocol
    if (trimmed.includes("://")) {
      displayDomain = new URL(trimmed).hostname;
    } else {
      displayDomain = new URL("https://" + trimmed).hostname;
    }
  } catch {
    return null;
  }

  // Extract domain from href
  let hrefDomain: string;
  try {
    hrefDomain = new URL(url).hostname;
  } catch {
    return null;
  }

  const displayRegistrable = getRegistrableDomain(displayDomain);
  const hrefRegistrable = getRegistrableDomain(hrefDomain);

  if (displayRegistrable !== hrefRegistrable) {
    return {
      ruleId: "display-mismatch",
      name: "Display vs URL Mismatch",
      score: 60,
      detail: `Link text shows "${displayDomain}" but points to "${hrefDomain}"`,
    };
  }
  return null;
}

function checkExcessiveSubdomains(hostname: string): TriggeredRule | null {
  const dotCount = (hostname.match(/\./g) ?? []).length;
  if (dotCount >= 4) {
    return {
      ruleId: "excessive-subdomains",
      name: "Excessive Subdomains",
      score: 25,
      detail: `Hostname has ${dotCount} dots: ${hostname}`,
    };
  }
  return null;
}

function checkUrlShortener(hostname: string): TriggeredRule | null {
  const lower = hostname.toLowerCase();
  if (URL_SHORTENERS.has(lower)) {
    return {
      ruleId: "url-shortener",
      name: "URL Shortener",
      score: 15,
      detail: `Link uses URL shortener: ${hostname}`,
    };
  }
  return null;
}

function checkSuspiciousPathKeywords(pathname: string, search: string): TriggeredRule | null {
  const combined = (pathname + search).toLowerCase();
  const found = SUSPICIOUS_PATH_KEYWORDS.filter((kw) => combined.includes(kw));
  if (found.length > 0) {
    return {
      ruleId: "suspicious-keywords",
      name: "Suspicious Path Keywords",
      score: 15,
      detail: `Path contains suspicious keywords: ${found.join(", ")}`,
    };
  }
  return null;
}

function checkDangerousProtocol(url: string): TriggeredRule | null {
  const lower = url.trim().toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      return {
        ruleId: "dangerous-protocol",
        name: "Dangerous URI Scheme",
        score: 70,
        detail: `Uses dangerous protocol: ${proto}`,
      };
    }
  }
  return null;
}

function checkUrlObfuscation(url: string, _hostname: string): TriggeredRule | null {
  // Check for @ before hostname (userinfo in URL) — use the raw URL string
  // The @ sign before hostname tricks users into thinking they're visiting
  // a different domain
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      return {
        ruleId: "url-obfuscation",
        name: "URL Obfuscation",
        score: 45,
        detail: "URL contains @ sign used for credential spoofing",
      };
    }
  } catch {
    // If URL can't be parsed, check raw string
    if (url.includes("@")) {
      return {
        ruleId: "url-obfuscation",
        name: "URL Obfuscation",
        score: 45,
        detail: "URL contains @ sign used for credential spoofing",
      };
    }
  }

  // Check for percent-encoded hostname in the raw URL string.
  // URL parsers normalize percent encoding, so we must check the raw string.
  // Extract the host portion from the raw URL (between :// and the next / or end).
  const protoEnd = url.indexOf("://");
  if (protoEnd !== -1) {
    const afterProto = url.slice(protoEnd + 3);
    const hostEnd = afterProto.search(/[/?#]/);
    const rawHost = hostEnd === -1 ? afterProto : afterProto.slice(0, hostEnd);
    // Strip userinfo (anything before @)
    const atIdx = rawHost.lastIndexOf("@");
    const hostPart = atIdx !== -1 ? rawHost.slice(atIdx + 1) : rawHost;
    if (hostPart.includes("%")) {
      return {
        ruleId: "url-obfuscation",
        name: "URL Obfuscation",
        score: 45,
        detail: "Hostname contains percent-encoded characters",
      };
    }
  }

  return null;
}

function checkBrandImpersonation(hostname: string, pathname: string): TriggeredRule | null {
  const lowerHost = hostname.toLowerCase();
  const lowerPath = pathname.toLowerCase();
  const registrable = getRegistrableDomain(lowerHost);
  // Extract just the second-level domain name (e.g. "paypal" from "paypal.com")
  const sld = registrable.split(".")[0] ?? "";

  for (const brand of IMPERSONATED_BRANDS) {
    // Brand must appear anywhere in the hostname or path
    const brandInUrl = lowerHost.includes(brand) || lowerPath.includes(brand);

    if (brandInUrl) {
      // Safe only if the SLD exactly matches the brand (i.e. it's the real domain)
      // e.g. paypal.com → sld "paypal" = brand "paypal" → safe
      // e.g. paypal-security.com → sld "paypal-security" ≠ "paypal" → flagged
      // e.g. paypal.evil.com → sld "evil" ≠ "paypal" → flagged
      if (sld !== brand) {
        return {
          ruleId: "brand-impersonation",
          name: "Brand Impersonation",
          score: 50,
          detail: `"${brand}" appears in URL but domain is ${registrable}`,
        };
      }
    }
  }
  return null;
}

// ── Main Analysis Function ─────────────────────────────────────────

export function analyzeLink(url: string, displayText: string): LinkAnalysis {
  const triggeredRules: TriggeredRule[] = [];

  // Rule 8: Dangerous protocol — check first since URL may not be parseable
  const dangerousProto = checkDangerousProtocol(url);
  if (dangerousProto) {
    triggeredRules.push(dangerousProto);
    const riskScore = dangerousProto.score;
    return {
      url,
      displayText,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      triggeredRules,
    };
  }

  // Parse the URL for remaining rules
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unparseable URL — return as-is with no rules
    return {
      url,
      displayText,
      riskScore: 0,
      riskLevel: "safe",
      triggeredRules: [],
    };
  }

  const hostname = parsed.hostname;
  const pathname = parsed.pathname;
  const search = parsed.search;

  // Rule 1: IP address
  const ip = checkIpAddress(hostname);
  if (ip) triggeredRules.push(ip);

  // Rule 2: Homograph/Punycode
  const homograph = checkHomograph(hostname);
  if (homograph) triggeredRules.push(homograph);

  // Rule 3: Suspicious TLD
  const tld = checkSuspiciousTld(hostname);
  if (tld) triggeredRules.push(tld);

  // Rule 4: Display vs Href mismatch
  const mismatch = checkDisplayHrefMismatch(url, displayText);
  if (mismatch) triggeredRules.push(mismatch);

  // Rule 5: Excessive subdomains
  const subdomains = checkExcessiveSubdomains(hostname);
  if (subdomains) triggeredRules.push(subdomains);

  // Rule 6: URL shorteners
  const shortener = checkUrlShortener(hostname);
  if (shortener) triggeredRules.push(shortener);

  // Rule 7: Suspicious path keywords
  const keywords = checkSuspiciousPathKeywords(pathname, search);
  if (keywords) triggeredRules.push(keywords);

  // Rule 9: URL obfuscation
  const obfuscation = checkUrlObfuscation(url, hostname);
  if (obfuscation) triggeredRules.push(obfuscation);

  // Rule 10: Brand impersonation
  const brand = checkBrandImpersonation(hostname, pathname);
  if (brand) triggeredRules.push(brand);

  const riskScore = triggeredRules.reduce((sum, r) => sum + r.score, 0);

  return {
    url,
    displayText,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    triggeredRules,
  };
}

// ── HTML Scanning ──────────────────────────────────────────────────

export function scanLinksInHtml(html: string): LinkAnalysis[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const anchors = doc.querySelectorAll("a[href]");

  const results: LinkAnalysis[] = [];
  let count = 0;

  for (const anchor of anchors) {
    if (count >= MAX_LINKS) break;

    const href = anchor.getAttribute("href") ?? "";
    const trimmedHref = href.trim();

    // Skip mailto:, tel:, #, empty, and relative URLs
    if (
      !trimmedHref ||
      trimmedHref.startsWith("mailto:") ||
      trimmedHref.startsWith("tel:") ||
      trimmedHref.startsWith("#")
    ) {
      continue;
    }

    // Skip relative URLs (no protocol and doesn't look like a dangerous scheme)
    if (!trimmedHref.includes("://") && !trimmedHref.startsWith("data:") && !trimmedHref.startsWith("javascript:") && !trimmedHref.startsWith("vbscript:") && !trimmedHref.startsWith("blob:")) {
      continue;
    }

    const displayText = anchor.textContent ?? "";
    const analysis = analyzeLink(trimmedHref, displayText);
    results.push(analysis);
    count++;
  }

  return results;
}

// ── Message Scanning ───────────────────────────────────────────────

export type PhishingSensitivity = "low" | "default" | "high";

/** Banner thresholds per sensitivity level */
const SENSITIVITY_THRESHOLDS: Record<PhishingSensitivity, { scoreThreshold: number; countThreshold: number }> = {
  low: { scoreThreshold: 60, countThreshold: 5 },
  default: { scoreThreshold: 40, countThreshold: 3 },
  high: { scoreThreshold: 20, countThreshold: 1 },
};

export function scanMessage(messageId: string, html: string | null, sensitivity: PhishingSensitivity = "default"): MessageScanResult {
  if (!html) {
    return {
      messageId,
      links: [],
      maxRiskScore: 0,
      suspiciousLinkCount: 0,
      showBanner: false,
      scannedAt: Date.now(),
    };
  }

  const links = scanLinksInHtml(html);
  const maxRiskScore = links.reduce((max, l) => Math.max(max, l.riskScore), 0);
  const suspiciousLinkCount = links.filter((l) => l.riskScore >= 20).length;
  const { scoreThreshold, countThreshold } = SENSITIVITY_THRESHOLDS[sensitivity];
  const showBanner = maxRiskScore >= scoreThreshold || suspiciousLinkCount >= countThreshold;

  return {
    messageId,
    links,
    maxRiskScore,
    suspiciousLinkCount,
    showBanner,
    scannedAt: Date.now(),
  };
}
