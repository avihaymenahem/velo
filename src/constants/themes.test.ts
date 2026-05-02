import { describe, it, expect } from "vitest";
import {
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
  getThemeById,
} from "./themes";

describe("themes", () => {
  it("all themes have unique IDs", () => {
    const ids = COLOR_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all themes have complete light and dark color sets", () => {
    const requiredKeys = ["accent", "accentHover", "accentLight", "bgSelected", "sidebarActive"];
    for (const theme of COLOR_THEMES) {
      for (const key of requiredKeys) {
        expect(theme.light).toHaveProperty(key);
        expect(theme.light[key as keyof typeof theme.light]).toBeTruthy();
        expect(theme.dark).toHaveProperty(key);
        expect(theme.dark[key as keyof typeof theme.dark]).toBeTruthy();
      }
    }
  });

  it("DEFAULT_COLOR_THEME is prussian_blue", () => {
    expect(DEFAULT_COLOR_THEME).toBe("prussian_blue");
  });

  it("getThemeById returns correct theme", () => {
    const twilight = getThemeById("twilight_indigo");
    expect(twilight.id).toBe("twilight_indigo");
    expect(twilight.name).toBe("Twilight Indigo");

    const gunmetal = getThemeById("gunmetal");
    expect(gunmetal.id).toBe("gunmetal");
  });

  it("getThemeById falls back to prussian_blue for unknown ID", () => {
    const fallback = getThemeById("nonexistent");
    expect(fallback.id).toBe("prussian_blue");
  });
});
