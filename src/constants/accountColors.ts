export const ACCOUNT_COLOR_PRESETS = [
  "#E53E3E", // red
  "#DD6B20", // orange
  "#D69E2E", // yellow
  "#38A169", // green
  "#3182CE", // blue
  "#805AD5", // purple
  "#D53F8C", // pink
  "#319795", // teal
] as const;

export type AccountColorPreset = (typeof ACCOUNT_COLOR_PRESETS)[number];
