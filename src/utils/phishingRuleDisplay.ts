import type { TFunction } from "i18next";
import type { TriggeredRule } from "./phishingDetector";

interface RuleDisplay {
  name: string;
  detail: string;
}

function matchDetail(detail: string, pattern: RegExp): RegExpMatchArray | null {
  return detail.match(pattern);
}

export function getPhishingRuleDisplay(rule: TriggeredRule, t: TFunction<"email">): RuleDisplay {
  const name = t(`linkConfirm.rules.${rule.ruleId}.name`, { defaultValue: rule.name });
  const detail = getLocalizedDetail(rule, t);

  return {
    name,
    detail: detail ?? rule.detail,
  };
}

function getLocalizedDetail(rule: TriggeredRule, t: TFunction<"email">): string | null {
  switch (rule.ruleId) {
    case "ip-address": {
      const match = matchDetail(rule.detail, /^URL points to raw IP address: (.+)$/);
      return match ? t("linkConfirm.rules.ip-address.detail", { hostname: match[1] }) : null;
    }
    case "homograph": {
      const match = matchDetail(rule.detail, /^Domain uses Punycode \(internationalized characters\): (.+)$/);
      return match ? t("linkConfirm.rules.homograph.detail", { hostname: match[1] }) : null;
    }
    case "suspicious-tld": {
      const match = matchDetail(rule.detail, /^(High|Medium|Low)-risk top-level domain: (.+)$/);
      if (!match) return null;
      const level = match[1]?.toLowerCase();
      if (level === "high") return t("linkConfirm.rules.suspicious-tld.detailHigh", { tld: match[2] });
      if (level === "medium") return t("linkConfirm.rules.suspicious-tld.detailMedium", { tld: match[2] });
      return t("linkConfirm.rules.suspicious-tld.detailLow", { tld: match[2] });
    }
    case "display-mismatch": {
      const match = matchDetail(rule.detail, /^Link text shows "(.+)" but points to "(.+)"$/);
      return match
        ? t("linkConfirm.rules.display-mismatch.detail", { displayDomain: match[1], hrefDomain: match[2] })
        : null;
    }
    case "excessive-subdomains": {
      const match = matchDetail(rule.detail, /^Hostname has (\d+) dots: (.+)$/);
      return match ? t("linkConfirm.rules.excessive-subdomains.detail", { count: match[1], hostname: match[2] }) : null;
    }
    case "url-shortener": {
      const match = matchDetail(rule.detail, /^Link uses URL shortener: (.+)$/);
      return match ? t("linkConfirm.rules.url-shortener.detail", { hostname: match[1] }) : null;
    }
    case "suspicious-keywords": {
      const match = matchDetail(rule.detail, /^Path contains suspicious keywords: (.+)$/);
      return match ? t("linkConfirm.rules.suspicious-keywords.detail", { keywords: match[1] }) : null;
    }
    case "dangerous-protocol": {
      const match = matchDetail(rule.detail, /^Uses dangerous protocol: (.+)$/);
      return match ? t("linkConfirm.rules.dangerous-protocol.detail", { protocol: match[1] }) : null;
    }
    case "url-obfuscation": {
      if (rule.detail === "URL contains @ sign used for credential spoofing") {
        return t("linkConfirm.rules.url-obfuscation.detailCredentialSpoofing");
      }
      if (rule.detail === "Hostname contains percent-encoded characters") {
        return t("linkConfirm.rules.url-obfuscation.detailPercentEncoded");
      }
      return null;
    }
    case "brand-impersonation": {
      const match = matchDetail(rule.detail, /^"(.+)" appears in URL but domain is (.+)$/);
      return match ? t("linkConfirm.rules.brand-impersonation.detail", { brand: match[1], domain: match[2] }) : null;
    }
    default:
      return null;
  }
}
