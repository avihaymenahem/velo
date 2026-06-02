import i18n from "./index";
import {
  applyLanguagePreference,
  getLanguagePreference,
  initializeLanguageFromSettings,
  saveLanguagePreference,
} from "./settings";
import { getSetting, setSetting } from "@/services/db/settings";

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

const mockGetSetting = vi.mocked(getSetting);
const mockSetSetting = vi.mocked(setSetting);

describe("i18n settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.lang = "en";
    await i18n.changeLanguage("en");
  });

  it("falls back to system preference when the stored value is missing or invalid", async () => {
    mockGetSetting.mockResolvedValueOnce(null);
    await expect(getLanguagePreference()).resolves.toBe("system");

    mockGetSetting.mockResolvedValueOnce("ja");
    await expect(getLanguagePreference()).resolves.toBe("system");
  });

  it("initializes i18n from the stored language preference", async () => {
    mockGetSetting.mockResolvedValueOnce("zh-CN");

    await expect(initializeLanguageFromSettings()).resolves.toBe("zh-CN");

    expect(i18n.language).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("saves the language preference before applying it", async () => {
    mockSetSetting.mockResolvedValueOnce(undefined);

    await expect(saveLanguagePreference("zh-CN")).resolves.toBe("zh-CN");

    expect(mockSetSetting).toHaveBeenCalledWith("language", "zh-CN");
    expect(i18n.language).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("resolves system preference using the provided system language", async () => {
    await expect(applyLanguagePreference("system", "zh-Hans-CN")).resolves.toBe("zh-CN");
    expect(i18n.language).toBe("zh-CN");
  });
});
