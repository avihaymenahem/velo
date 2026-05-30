import type { CSSProperties } from "react";

function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return `rgba(100,100,100,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function chipStyle(color: string | null | undefined): CSSProperties {
  if (!color) return {};
  return { backgroundColor: hexToRgba(color, 0.15), color };
}

export function accentBarStyle(color: string | null | undefined): CSSProperties {
  if (!color) return {};
  return { backgroundColor: color };
}
