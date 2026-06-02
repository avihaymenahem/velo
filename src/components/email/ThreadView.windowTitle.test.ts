import i18n from "@/i18n";
import { buildThreadWindowTitle } from "./ThreadView";

describe("buildThreadWindowTitle", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("uses the localized fallback title in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const t = i18n.getFixedT("zh-CN", "email");

    expect(buildThreadWindowTitle(null, t)).toBe("线程");
    expect(buildThreadWindowTitle(undefined, t)).toBe("线程");
  });

  it("keeps the thread subject when present", () => {
    const t = i18n.getFixedT("en", "email");

    expect(buildThreadWindowTitle("Investor update", t)).toBe("Investor update");
  });
});
