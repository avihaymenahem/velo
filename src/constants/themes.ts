export type ColorThemeId =
  | "indigo"
  | "rose"
  | "emerald"
  | "amber"
  | "sky"
  | "violet"
  | "orange"
  | "slate";

interface ThemeColors {
  accent: string;
  accentHover: string;
  accentLight: string;
  bgSelected: string;
  sidebarActive: string;
}

export interface ColorTheme {
  id: ColorThemeId;
  name: string;
  nameKey: string;
  swatch: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "indigo",
    name: "Indigo",
    nameKey: "themes.indigo",
    swatch: "#4f46e5",
    light: {
      accent: "#4f46e5",
      accentHover: "#4338ca",
      accentLight: "#e0e7ff",
      bgSelected: "rgba(224, 231, 255, 0.65)",
      sidebarActive: "#4f46e5",
    },
    dark: {
      accent: "#818cf8",
      accentHover: "#6366f1",
      accentLight: "#312e81",
      bgSelected: "rgba(30, 58, 95, 0.55)",
      sidebarActive: "#818cf8",
    },
  },
  {
    id: "rose",
    name: "Rose",
    nameKey: "themes.rose",
    swatch: "#e11d48",
    light: {
      accent: "#e11d48",
      accentHover: "#be123c",
      accentLight: "#ffe4e6",
      bgSelected: "rgba(255, 228, 230, 0.65)",
      sidebarActive: "#e11d48",
    },
    dark: {
      accent: "#fb7185",
      accentHover: "#f43f5e",
      accentLight: "#4c0519",
      bgSelected: "rgba(76, 5, 25, 0.55)",
      sidebarActive: "#fb7185",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    nameKey: "themes.emerald",
    swatch: "#059669",
    light: {
      accent: "#059669",
      accentHover: "#047857",
      accentLight: "#d1fae5",
      bgSelected: "rgba(209, 250, 229, 0.65)",
      sidebarActive: "#059669",
    },
    dark: {
      accent: "#34d399",
      accentHover: "#10b981",
      accentLight: "#064e3b",
      bgSelected: "rgba(6, 78, 59, 0.55)",
      sidebarActive: "#34d399",
    },
  },
  {
    id: "amber",
    name: "Amber",
    nameKey: "themes.amber",
    swatch: "#d97706",
    light: {
      accent: "#d97706",
      accentHover: "#b45309",
      accentLight: "#fef3c7",
      bgSelected: "rgba(254, 243, 199, 0.65)",
      sidebarActive: "#d97706",
    },
    dark: {
      accent: "#fbbf24",
      accentHover: "#f59e0b",
      accentLight: "#78350f",
      bgSelected: "rgba(120, 53, 15, 0.55)",
      sidebarActive: "#fbbf24",
    },
  },
  {
    id: "sky",
    name: "Sky",
    nameKey: "themes.sky",
    swatch: "#0284c7",
    light: {
      accent: "#0284c7",
      accentHover: "#0369a1",
      accentLight: "#e0f2fe",
      bgSelected: "rgba(224, 242, 254, 0.65)",
      sidebarActive: "#0284c7",
    },
    dark: {
      accent: "#38bdf8",
      accentHover: "#0ea5e9",
      accentLight: "#0c4a6e",
      bgSelected: "rgba(12, 74, 110, 0.55)",
      sidebarActive: "#38bdf8",
    },
  },
  {
    id: "violet",
    name: "Violet",
    nameKey: "themes.violet",
    swatch: "#7c3aed",
    light: {
      accent: "#7c3aed",
      accentHover: "#6d28d9",
      accentLight: "#ede9fe",
      bgSelected: "rgba(237, 233, 254, 0.65)",
      sidebarActive: "#7c3aed",
    },
    dark: {
      accent: "#a78bfa",
      accentHover: "#8b5cf6",
      accentLight: "#2e1065",
      bgSelected: "rgba(46, 16, 101, 0.55)",
      sidebarActive: "#a78bfa",
    },
  },
  {
    id: "orange",
    name: "Orange",
    nameKey: "themes.orange",
    swatch: "#ea580c",
    light: {
      accent: "#ea580c",
      accentHover: "#c2410c",
      accentLight: "#ffedd5",
      bgSelected: "rgba(255, 237, 213, 0.65)",
      sidebarActive: "#ea580c",
    },
    dark: {
      accent: "#fb923c",
      accentHover: "#f97316",
      accentLight: "#7c2d12",
      bgSelected: "rgba(124, 45, 18, 0.55)",
      sidebarActive: "#fb923c",
    },
  },
  {
    id: "slate",
    name: "Slate",
    nameKey: "themes.slate",
    swatch: "#475569",
    light: {
      accent: "#475569",
      accentHover: "#334155",
      accentLight: "#e2e8f0",
      bgSelected: "rgba(226, 232, 240, 0.65)",
      sidebarActive: "#475569",
    },
    dark: {
      accent: "#94a3b8",
      accentHover: "#64748b",
      accentLight: "#1e293b",
      bgSelected: "rgba(30, 41, 59, 0.55)",
      sidebarActive: "#94a3b8",
    },
  },
];

export const DEFAULT_COLOR_THEME: ColorThemeId = "indigo";

export function getThemeById(id: string): ColorTheme {
  return (
    COLOR_THEMES.find((t) => t.id === id) ??
    COLOR_THEMES.find((t) => t.id === DEFAULT_COLOR_THEME)!
  );
}
