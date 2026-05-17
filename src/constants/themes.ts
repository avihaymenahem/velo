/**
 * Melo · Color Themes — v2
 * IDs invariati per back-compat delle user prefs. Solo `name` e valori cambiano.
 */

export type ColorThemeId =
  | "ink_black"
  | "prussian_blue"
  | "sage" // Now: Sage (verde)
  | "midnight_violet" // Now: Iris (viola morbido)
  | "night_bordeaux"  // Now: Claret
  | "orange"          // Now: Persimmon
  | "golden_bronze"   // Now: Amber (default Melo)
  | "gunmetal";       // Now: Slate

interface ThemeColors {
  accent: string;
  accentHover: string;
  accentLight: string;
  accentLowerBar: string;
  bgSelected: string;
  sidebarActive: string;
}

export interface ColorTheme {
  id: ColorThemeId;
  name: string;
  swatch: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "ink_black",
    name: "Ink Black",
    swatch: "#1F1F23",
    light: {
      accent: "#1F1F23",
      accentHover: "#0A0A0C",
      accentLight: "rgba(31, 31, 35, 0.08)",
      accentLowerBar: "#1F1F23",
      bgSelected: "rgba(31, 31, 35, 0.10)",
      sidebarActive: "#1F1F23",
    },
    dark: {
      accent: "#D4D4D8",
      accentHover: "#3B3B3B",
      accentLight: "rgba(212, 212, 216, 0.12)",
      accentLowerBar: "#2C2C2C",
      bgSelected: "rgba(212, 212, 216, 0.10)",
      sidebarActive: "#D4D4D8",
    },
  },
  {
    id: "prussian_blue",
    name: "Prussian Blue",
    swatch: "#1E3A5F",
    light: {
      accent: "#1E3A5F",
      accentHover: "#122642",
      accentLight: "rgba(30, 58, 95, 0.10)",
      accentLowerBar: "#1E3A5F",
      bgSelected: "rgba(30, 58, 95, 0.10)",
      sidebarActive: "#1E3A5F",
    },
    dark: {
      accent: "#6B9BCC",
      accentHover: "#87B0DA",
      accentLight: "rgba(107, 155, 204, 0.14)",
      accentLowerBar: "#1E3A5F",
      bgSelected: "rgba(107, 155, 204, 0.10)",
      sidebarActive: "#6B9BCC",
    },
  },
  {
    id: "sage",
    name: "Sage",
    swatch: "#4F6B3F",
    light: {
      accent: "#4F6B3F",
      accentHover: "#3B5230",
      accentLight: "rgba(79, 107, 63, 0.10)",
      accentLowerBar: "#4F6B3F",
      bgSelected: "rgba(79, 107, 63, 0.10)",
      sidebarActive: "#4F6B3F",
    },
    dark: {
      accent: "#9BC287",
      accentHover: "#B0D29B",
      accentLight: "rgba(155, 194, 135, 0.14)",
      accentLowerBar: "#9BC287",
      bgSelected: "rgba(155, 194, 135, 0.10)",
      sidebarActive: "#9BC287",
    },
  },
  {
    id: "midnight_violet",
    name: "Iris",
    swatch: "#5E3A8C",
    light: {
      accent: "#5E3A8C",
      accentHover: "#472A6E",
      accentLight: "rgba(94, 58, 140, 0.10)",
      accentLowerBar: "#5E3A8C",
      bgSelected: "rgba(94, 58, 140, 0.10)",
      sidebarActive: "#5E3A8C",
    },
    dark: {
      accent: "#B097D8",
      accentHover: "#C2AEE0",
      accentLight: "rgba(176, 151, 216, 0.14)",
      accentLowerBar: "#B097D8",
      bgSelected: "rgba(176, 151, 216, 0.10)",
      sidebarActive: "#B097D8",
    },
  },
  {
    id: "night_bordeaux",
    name: "Claret",
    swatch: "#7C2530",
    light: {
      accent: "#7C2530",
      accentHover: "#5C1922",
      accentLight: "rgba(124, 37, 48, 0.10)",
      accentLowerBar: "#7C2530",
      bgSelected: "rgba(124, 37, 48, 0.10)",
      sidebarActive: "#7C2530",
    },
    dark: {
      accent: "#D85565",
      accentHover: "#E1707E",
      accentLight: "rgba(216, 85, 101, 0.14)",
      accentLowerBar: "#D85565",
      bgSelected: "rgba(216, 85, 101, 0.10)",
      sidebarActive: "#D85565",
    },
  },
  {
    id: "orange",
    name: "Persimmon",
    swatch: "#C66020",
    light: {
      accent: "#C66020",
      accentHover: "#9C4A15",
      accentLight: "rgba(198, 96, 32, 0.10)",
      accentLowerBar: "#C66020",
      bgSelected: "rgba(198, 96, 32, 0.10)",
      sidebarActive: "#C66020",
    },
    dark: {
      accent: "#F2924D",
      accentHover: "#F5A86A",
      accentLight: "rgba(242, 146, 77, 0.14)",
      accentLowerBar: "#F2924D",
      bgSelected: "rgba(242, 146, 77, 0.10)",
      sidebarActive: "#F2924D",
    },
  },
  {
    id: "golden_bronze",
    name: "Amber",
    swatch: "#C9A41C",
    light: {
      accent: "#C9A41C",
      accentHover: "#B08F15",
      accentLight: "rgba(201, 164, 28, 0.10)",
      accentLowerBar: "#C9A41C",
      bgSelected: "rgba(201, 164, 28, 0.12)",
      sidebarActive: "#C9A41C",
    },
    dark: {
      accent: "#E8C547",
      accentHover: "#F4D75E",
      accentLight: "rgba(232, 197, 71, 0.10)",
      accentLowerBar: "#A18317",
      bgSelected: "rgba(232, 197, 71, 0.10)",
      sidebarActive: "#E8C547",
    },
  },
  {
    id: "gunmetal",
    name: "Slate",
    swatch: "#2F4858",
    light: {
      accent: "#2F4858",
      accentHover: "#1F3340",
      accentLight: "rgba(47, 72, 88, 0.10)",
      accentLowerBar: "#2F4858",
      bgSelected: "rgba(47, 72, 88, 0.10)",
      sidebarActive: "#2F4858",
    },
    dark: {
      accent: "#7B96AB",
      accentHover: "#94ADBE",
      accentLight: "rgba(123, 150, 171, 0.14)",
      accentLowerBar: "#28343E",
      bgSelected: "rgba(123, 150, 171, 0.10)",
      sidebarActive: "#7B96AB",
    },
  },
];

export const DEFAULT_COLOR_THEME: ColorThemeId = "golden_bronze";

export function getThemeById(id: string): ColorTheme {
  return (
    COLOR_THEMES.find((t) => t.id === id) ??
    COLOR_THEMES.find((t) => t.id === DEFAULT_COLOR_THEME)!
  );
}
