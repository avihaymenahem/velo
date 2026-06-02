import i18n from "@/i18n";
import { buildThreadExportDialogOptions } from "./ThreadView";

describe("buildThreadExportDialogOptions", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("localizes the no-subject export dialog defaults in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const t = i18n.getFixedT("zh-CN", "email");

    expect(buildThreadExportDialogOptions(null, t)).toEqual({
      defaultPath: "邮件.eml",
      filters: [{ name: "邮件", extensions: ["eml"] }],
    });
  });

  it("keeps subject-derived export filenames", () => {
    const t = i18n.getFixedT("en", "email");

    expect(buildThreadExportDialogOptions("Investor update / Q2", t)).toEqual({
      defaultPath: "Investor_update___Q2.eml",
      filters: [{ name: "Email", extensions: ["eml"] }],
    });
  });
});
