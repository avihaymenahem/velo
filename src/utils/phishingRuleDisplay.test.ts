import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { getPhishingRuleDisplay } from "./phishingRuleDisplay";
import type { TriggeredRule } from "./phishingDetector";

describe("getPhishingRuleDisplay", () => {
  it("preserves English detector text by default", () => {
    const rule: TriggeredRule = {
      ruleId: "url-shortener",
      name: "URL Shortener",
      score: 15,
      detail: "Link uses URL shortener: bit.ly",
    };

    const display = getPhishingRuleDisplay(rule, i18n.getFixedT("en", "email"));

    expect(display).toEqual({
      name: "URL Shortener",
      detail: "Link uses URL shortener: bit.ly",
    });
  });

  it("localizes known rules in Simplified Chinese", () => {
    const rule: TriggeredRule = {
      ruleId: "suspicious-keywords",
      name: "Suspicious Path Keywords",
      score: 15,
      detail: "Path contains suspicious keywords: login, token",
    };

    const display = getPhishingRuleDisplay(rule, i18n.getFixedT("zh-CN", "email"));

    expect(display).toEqual({
      name: "可疑路径关键词",
      detail: "路径包含可疑关键词：login, token",
    });
  });

  it("falls back to detector text for unmatched details", () => {
    const rule: TriggeredRule = {
      ruleId: "suspicious-keywords",
      name: "Suspicious Path Keywords",
      score: 15,
      detail: "Unexpected detector detail",
    };

    const display = getPhishingRuleDisplay(rule, i18n.getFixedT("zh-CN", "email"));

    expect(display).toEqual({
      name: "可疑路径关键词",
      detail: "Unexpected detector detail",
    });
  });
});
