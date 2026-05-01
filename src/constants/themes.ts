export type ColorThemeId =
  | "twilight_indigo"
  | "night_bordeaux"
  | "ink_black"
  | "golden_bronze"
  | "prussian_blue"
  | "midnight_violet"
  | "orange"
  | "gunmetal";

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
  swatch: string;
  light: ThemeColors;
  dark: ThemeColors;
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "twilight_indigo",
    name: "Twilight Indigo",
    swatch: "#1D3461",
    light: {
      accent: "#1D3461",
      accentHover: "#11213D",
      accentLight: "#EDF2FB",
      bgSelected: "rgba(29, 52, 97, 0.1)",
      sidebarActive: "#1D3461",
    },
    dark: {
      accent: "#375A9E", // Un indaco crepuscolare, saturo ma scuro
      accentHover: "#4A72C2",
      accentLight: "rgba(55, 90, 158, 0.18)",
      bgSelected: "rgba(55, 90, 158, 0.14)",
      sidebarActive: "#375A9E",
    },
  },
  {
    id: "night_bordeaux",
    name: "Night Bordeaux",
    swatch: "#4c0519",
    light: {
      accent: "#640d14",
      accentHover: "#38040e",
      accentLight: "#fdf2f2",
      bgSelected: "rgba(100, 13, 20, 0.1)",
      sidebarActive: "#640d14",
    },
    dark: {
      accent: "#991b1b",
      accentHover: "#b91c1c",
      accentLight: "rgba(153, 27, 27, 0.18)",
      bgSelected: "rgba(153, 27, 27, 0.14)",
      sidebarActive: "#991b1b",
    },
  },
  {
    id: "ink_black",
    name: "Ink Black",
    swatch: "#011C27",
    light: {
      accent: "#011C27",
      accentHover: "#000B11",
      accentLight: "#E1E8EB",
      bgSelected: "rgba(1, 28, 39, 0.12)",
      sidebarActive: "#011C27",
    },
    dark: {
      accent: "#024B6A", // Blu inchiostro denso
      accentHover: "#036994",
      accentLight: "rgba(2, 75, 106, 0.2)",
      bgSelected: "rgba(2, 75, 106, 0.15)",
      sidebarActive: "#024B6A",
    },
  },
  {
    id: "golden_bronze",
    name: "Golden Bronze",
    swatch: "#92400e",
    light: {
      accent: "#8B5E34",
      accentHover: "#6F4A27",
      accentLight: "#fdfaf7",
      bgSelected: "rgba(139, 94, 52, 0.1)",
      sidebarActive: "#8B5E34",
    },
    dark: {
      accent: "#A87F32",
      accentHover: "#C59D5F",
      accentLight: "rgba(168, 127, 50, 0.18)",
      bgSelected: "rgba(168, 127, 50, 0.14)",
      sidebarActive: "#A87F32",
    },
  },
  {
    id: "prussian_blue",
    name: "Prussian Blue",
    swatch: "#03254E",
    light: {
      accent: "#03254E",
      accentHover: "#01162E",
      accentLight: "#E6EAEE",
      bgSelected: "rgba(3, 37, 78, 0.1)",
      sidebarActive: "#03254E",
    },
    dark: {
      accent: "#1167B1", // Blu di Prussia illuminato, nobile e profondo
      accentHover: "#187BCD",
      accentLight: "rgba(17, 103, 177, 0.18)",
      bgSelected: "rgba(17, 103, 177, 0.14)",
      sidebarActive: "#1167B1",
    },
  },
  {
    id: "midnight_violet",
    name: "Midnight Violet",
    swatch: "#2e1065",
    light: {
      accent: "#432371",
      accentHover: "#2B1648",
      accentLight: "#f7f4fb",
      bgSelected: "rgba(67, 35, 113, 0.1)",
      sidebarActive: "#432371",
    },
    dark: {
      accent: "#5b3a8c",
      accentHover: "#7651b1",
      accentLight: "rgba(91, 58, 140, 0.18)",
      bgSelected: "rgba(91, 58, 140, 0.14)",
      sidebarActive: "#5b3a8c",
    },
  },
  {
    id: "orange",
    name: "Pure Orange",
    swatch: "#ea580c",
    light: {
      accent: "#D35400",
      accentHover: "#A04000",
      accentLight: "#fff7ed",
      bgSelected: "rgba(211, 84, 0, 0.1)",
      sidebarActive: "#D35400",
    },
    dark: {
      accent: "#E67E22",
      accentHover: "#F39C12",
      accentLight: "rgba(230, 126, 34, 0.18)",
      bgSelected: "rgba(230, 126, 34, 0.14)",
      sidebarActive: "#E67E22",
    },
  },
  {
    id: "gunmetal",
    name: "Gunmetal",
    swatch: "#2a3439",
    light: {
      accent: "#2a3439",
      accentHover: "#1c2326",
      accentLight: "#f2f4f5",
      bgSelected: "rgba(42, 52, 57, 0.1)",
      sidebarActive: "#2a3439",
    },
    dark: {
      accent: "#4A5D66",
      accentHover: "#607885",
      accentLight: "rgba(74, 93, 102, 0.18)",
      bgSelected: "rgba(74, 93, 102, 0.14)",
      sidebarActive: "#4A5D66",
    },
  },
];

export const DEFAULT_COLOR_THEME: ColorThemeId = "prussian_blue";

export function getThemeById(id: string): ColorTheme {
  return (
    COLOR_THEMES.find((t) => t.id === id) ??
    COLOR_THEMES.find((t) => t.id === DEFAULT_COLOR_THEME)!
  );
}
