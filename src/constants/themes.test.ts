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

  it("DEFAULT_COLOR_THEME is golden_bronze", () => {
    expect(DEFAULT_COLOR_THEME).toBe("golden_bronze");
  });

  it("getThemeById returns correct theme", () => {
    const sage = getThemeById("twilight_indigo");
    expect(sage.id).toBe("twilight_indigo");
    expect(sage.name).toBe("Sage");

    const slate = getThemeById("gunmetal");
    expect(slate.id).toBe("gunmetal");
    expect(slate.name).toBe("Slate");
  });

  it("getThemeById falls back to golden_bronze for unknown ID", () => {
    const fallback = getThemeById("nonexistent");
    expect(fallback.id).toBe("golden_bronze");
  });
});
